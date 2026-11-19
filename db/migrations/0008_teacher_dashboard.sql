BEGIN;

-- Shared facts for KPI, trends, report tables and CSV.
CREATE FUNCTION pojok_baca.student_activity(p_from date,p_to date)
RETURNS TABLE(user_id uuid,book_id bigint,activity_at timestamptz,activity_day date,kind text)
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.user_id,v.book_id,v.created_at,(v.created_at AT TIME ZONE 'Asia/Jakarta')::date,'session'::text
  FROM pojok_baca.book_views v JOIN public.users u USING(user_id)
  WHERE v.event_type='read_session' AND v.actor_role='user' AND u.role='user'
    AND v.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Jakarta')
    AND v.created_at < ((p_to+1)::timestamp AT TIME ZONE 'Asia/Jakarta')
  UNION ALL
  SELECT p.user_id,e.book_id,p.qualified_at,p.read_on,'page'::text
  FROM pojok_baca.reading_page_reads p JOIN public.users u USING(user_id)
  JOIN pojok_baca.book_editions e ON e.id=p.edition_id
  WHERE p.actor_role='user' AND u.role='user' AND p.read_on BETWEEN p_from AND p_to;
$$;

CREATE FUNCTION pojok_baca.admin_dashboard(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE today date := pojok_baca.report_today_wib();
BEGIN
  IF NOT pojok_baca.is_catalog_admin(p_actor) THEN RETURN NULL; END IF;
  RETURN (
    WITH facts AS MATERIALIZED (SELECT * FROM pojok_baca.student_activity(today-27,today))
    SELECT jsonb_build_object(
      'books',(SELECT count(*) FROM pojok_baca.books WHERE status='published' AND current_edition_id IS NOT NULL),
      'students',(SELECT count(DISTINCT f.user_id) FROM facts f JOIN public.users u USING(user_id)
          WHERE f.activity_day >= today-6 AND u.is_active),
      'sessions',(SELECT count(*) FROM facts WHERE activity_day >= today-6 AND kind='session'),
      'pending',(SELECT count(*) FROM pojok_baca.quotes q JOIN public.users u USING(user_id)
          WHERE q.is_public AND q.moderation_status='pending' AND u.is_active),
      'days',(SELECT jsonb_agg(jsonb_build_object('date',d.day,'sessions',d.sessions,'pages',d.pages) ORDER BY day)
        FROM (
          SELECT today-n AS day,count(f.kind) FILTER(WHERE f.kind='session') AS sessions,
                 count(f.kind) FILTER(WHERE f.kind='page') AS pages
          FROM generate_series(0,27) n LEFT JOIN facts f ON f.activity_day=today-n GROUP BY today-n
        ) d)
    )
  );
END;
$$;

CREATE FUNCTION pojok_baca.teacher_report(p_actor uuid,p_from date,p_to date,p_class text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT pojok_baca.is_catalog_admin(p_actor) OR p_from IS NULL OR p_to IS NULL
      OR p_to < p_from OR p_to-p_from > 365 THEN RETURN NULL; END IF;
  RETURN (
    WITH pupils AS (
      SELECT user_id,name,class_name FROM public.users
      WHERE role='user' AND class_name IS NOT NULL AND (p_class IS NULL OR class_name=p_class)
    ),
    facts AS MATERIALIZED (
      SELECT f.* FROM pojok_baca.student_activity(p_from,p_to) f JOIN pupils p USING(user_id)
    ),
    totals AS (
      SELECT user_id,count(DISTINCT book_id) AS books,count(*) FILTER (WHERE kind='page') AS pages
      FROM facts GROUP BY user_id
    ),
    latest AS (
      SELECT DISTINCT ON (f.user_id) f.user_id,b.title,f.activity_at
      FROM facts f JOIN pojok_baca.books b ON b.id=f.book_id
      ORDER BY f.user_id,f.activity_at DESC,f.book_id DESC
    )
    SELECT jsonb_build_object(
      'classes',coalesce((
        SELECT jsonb_agg(c.class_name ORDER BY c.class_name) FROM (
          SELECT DISTINCT class_name FROM public.users WHERE role='user' AND class_name IS NOT NULL
        ) c
      ),'[]'::jsonb),
      'rows',coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name',p.name,'className',p.class_name,'uniqueBooks',coalesce(t.books,0),
          'pages',coalesce(t.pages,0),'lastBook',l.title,'lastActive',l.activity_at
        ) ORDER BY p.class_name,lower(p.name),p.user_id)
        FROM pupils p LEFT JOIN totals t USING(user_id) LEFT JOIN latest l USING(user_id)
      ),'[]'::jsonb)
    )
  );
END;
$$;

CREATE FUNCTION pojok_baca.admin_moderation(p_actor uuid,p_status text,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT pojok_baca.is_catalog_admin(p_actor) THEN RETURN NULL; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created DESC,q.id DESC)
    FROM (
      SELECT * FROM (
        SELECT 'quote'::text AS kind,q.id::text AS id,q.quote_text AS body,u.name,b.title,
          q.moderation_status AS status,q.created_at AS created
        FROM pojok_baca.quotes q JOIN public.users u USING(user_id) JOIN pojok_baca.books b ON b.id=q.book_id
        WHERE q.is_public
        UNION ALL
        SELECT 'comment',c.id::text,c.body,u.name,b.title,c.moderation_status,c.created_at
        FROM pojok_baca.quote_comments c JOIN public.users u USING(user_id)
        JOIN pojok_baca.quotes q ON q.id=c.quote_id JOIN pojok_baca.books b ON b.id=q.book_id
        WHERE q.is_public
      ) items
      WHERE p_status IS NULL OR items.status=p_status
      ORDER BY created DESC,id DESC LIMIT 50 OFFSET 50*(least(greatest(p_page,1),100000)-1)
    ) q
  ),'[]'::jsonb);
END;
$$;

CREATE FUNCTION pojok_baca.admin_moderate(p_actor uuid,p_kind text,p_id bigint,p_decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT pojok_baca.is_catalog_admin(p_actor) OR p_decision NOT IN ('approved','rejected') THEN RETURN false; END IF;
  IF p_kind='quote' THEN
    UPDATE pojok_baca.quotes SET moderation_status=p_decision WHERE id=p_id AND is_public AND moderation_status<>p_decision;
  ELSIF p_kind='comment' THEN
    UPDATE pojok_baca.quote_comments c SET moderation_status=p_decision
    FROM pojok_baca.quotes q WHERE c.id=p_id AND q.id=c.quote_id AND q.is_public AND c.moderation_status<>p_decision;
  ELSE RETURN false; END IF;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
  VALUES(p_actor,'MODERATE_CONTENT',jsonb_build_object('kind',p_kind,'itemId',p_id,'decision',p_decision));
  RETURN true;
END;
$$;

CREATE FUNCTION pojok_baca.admin_recommend(p_actor uuid,p_slug text,p_recommend boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_book bigint;
BEGIN
  IF NOT pojok_baca.is_catalog_admin(p_actor) THEN RETURN false; END IF;
  UPDATE pojok_baca.books SET is_recommended=p_recommend,updated_at=clock_timestamp()
  WHERE slug=p_slug AND status='published' AND is_recommended IS DISTINCT FROM p_recommend RETURNING id INTO v_book;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
  VALUES(p_actor,'SET_RECOMMENDATION',jsonb_build_object('bookId',v_book,'recommended',p_recommend));
  RETURN true;
END;
$$;

CREATE FUNCTION pojok_baca.is_active_super_admin(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
RETURN EXISTS(SELECT FROM public.users WHERE user_id=p_user AND role='super_admin' AND is_active AND class_name IS NOT NULL);

CREATE FUNCTION pojok_baca.super_admin_users(p_actor uuid,p_search text,p_role text,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN NULL; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(u) ORDER BY lower(u.name),u.id)
    FROM (
      SELECT user_id AS id,name,class_name AS class,role,is_active AS active FROM public.users
      WHERE (p_role IS NULL OR role=p_role) AND (p_search IS NULL OR
        strpos(lower(name),lower(p_search))>0 OR strpos(lower(class_name),lower(p_search))>0 OR strpos(nisn,p_search)>0)
      ORDER BY lower(name),user_id LIMIT 50 OFFSET 50*(least(greatest(p_page,1),100000)-1)
    ) u
  ),'[]'::jsonb);
END;
$$;

CREATE FUNCTION pojok_baca.super_admin_update_user(p_actor uuid,p_user uuid,p_role text,p_active boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE old_user record; new_role text; new_active boolean;
BEGIN
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN 'forbidden'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('pojok_baca:super_admin_roster',0)) THEN RETURN 'busy'; END IF;
  -- Recheck the actor after acquiring the lock. Every mutation uses this same lock.
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN 'forbidden'; END IF;
  SELECT role,is_active,class_name INTO old_user FROM public.users WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN 'user_not_found'; END IF;
  new_role := coalesce(p_role,old_user.role);
  new_active := coalesce(p_active,old_user.is_active);
  IF new_role NOT IN ('user','admin','super_admin') THEN RETURN 'invalid_role'; END IF;
  IF old_user.class_name IS NULL AND (new_role='user' OR (new_active AND new_role='super_admin'))
  THEN RETURN 'incomplete_profile'; END IF;
  IF old_user.role='super_admin' AND old_user.is_active AND old_user.class_name IS NOT NULL
    AND (new_role <> 'super_admin' OR NOT new_active) AND NOT EXISTS (
      SELECT FROM public.users WHERE user_id<>p_user AND role='super_admin' AND is_active AND class_name IS NOT NULL
    ) THEN RETURN 'last_super_admin'; END IF;
  IF new_role=old_user.role AND new_active=old_user.is_active THEN RETURN 'ok'; END IF;
  UPDATE public.users SET role=new_role,is_active=new_active,updated_at=clock_timestamp() WHERE user_id=p_user;
  INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
  VALUES(p_actor,'UPDATE_USER_ACCESS',jsonb_build_object(
    'targetUser',p_user,'fromRole',old_user.role,'toRole',new_role,'fromActive',old_user.is_active,'toActive',new_active));
  RETURN 'ok';
END;
$$;

CREATE FUNCTION pojok_baca.super_admin_logs(p_actor uuid,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN NULL; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(a)-'id' ORDER BY a.created DESC,a.id DESC)
    FROM (
      SELECT l.id,u.name,l.action,l.created_at AS created,coalesce((
        SELECT jsonb_object_agg(k,v) FROM jsonb_each(l.target_info) AS item(k,v)
        WHERE k IN ('bookId','edition','previous','pages','kind','itemId','decision','recommended',
          'targetUser','fromRole','toRole','fromActive','toActive','from','to','classFiltered')
      ),'{}'::jsonb) AS target
      FROM pojok_baca.admin_audit_logs l JOIN public.users u ON u.user_id=l.admin_id
      ORDER BY l.created_at DESC,l.id DESC LIMIT 50 OFFSET 50*(least(greatest(p_page,1),100000)-1)
    ) a
  ),'[]'::jsonb);
END;
$$;

CREATE FUNCTION pojok_baca.super_admin_export_report(p_actor uuid,p_from date,p_to date,p_class text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE report jsonb;
BEGIN
  IF NOT pojok_baca.is_active_super_admin(p_actor) THEN RETURN NULL; END IF;
  report := pojok_baca.teacher_report(p_actor,p_from,p_to,p_class);
  IF report IS NULL THEN RETURN NULL; END IF;
  INSERT INTO pojok_baca.admin_audit_logs(admin_id,action,target_info)
  VALUES(p_actor,'EXPORT_TEACHER_REPORT',jsonb_build_object('from',p_from,'to',p_to,'classFiltered',p_class IS NOT NULL));
  RETURN report;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pojok_baca FROM PUBLIC;
COMMIT;
