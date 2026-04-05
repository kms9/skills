--
-- PostgreSQL database dump
--

\restrict QEDafGlBhvkR4WJQ4tgW1LSkGc5rwXxqNQCn7sGtP0GKcb38Q8hg7xisiJgxhKd

-- Dumped from database version 12.22
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner:
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner:
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner:
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: skills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.skills (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL,
    description text DEFAULT ''::text,
    tags text[] DEFAULT '{}'::text[],
    moderation_status text DEFAULT 'active'::text,
    latest_version_id uuid,
    stats_downloads bigint DEFAULT 0,
    stats_installs bigint DEFAULT 0,
    stats_versions integer DEFAULT 0,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_user_id uuid,
    stats_stars integer DEFAULT 0 NOT NULL,
    is_highlighted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.skills OWNER TO postgres;

--
-- Name: TABLE skills; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.skills IS '存储 ClawHub 技能的基本信息';


--
-- Name: COLUMN skills.slug; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.slug IS '技能的唯一标识符，用于 URL 和 CLI 命令';


--
-- Name: COLUMN skills.display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.display_name IS '技能的显示名称';


--
-- Name: COLUMN skills.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.description IS '技能的简短描述';


--
-- Name: COLUMN skills.tags; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.tags IS '技能标签数组，用于分类和搜索';


--
-- Name: COLUMN skills.moderation_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.moderation_status IS '审核状态：active, pending, rejected';


--
-- Name: COLUMN skills.latest_version_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.latest_version_id IS '最新版本的 ID，指向 skill_versions 表';


--
-- Name: COLUMN skills.stats_downloads; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.stats_downloads IS '下载次数统计';


--
-- Name: COLUMN skills.stats_installs; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.stats_installs IS '安装次数统计';


--
-- Name: COLUMN skills.stats_versions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.stats_versions IS '版本数量统计';


--
-- Name: COLUMN skills.is_deleted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skills.is_deleted IS '软删除标记';


--
-- Name: active_skills; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.active_skills AS
 SELECT skills.id,
    skills.slug,
    skills.display_name,
    skills.description,
    skills.tags,
    skills.moderation_status,
    skills.latest_version_id,
    skills.stats_downloads,
    skills.stats_installs,
    skills.stats_versions,
    skills.is_deleted,
    skills.created_at,
    skills.updated_at
   FROM public.skills
  WHERE ((skills.is_deleted = false) AND (skills.moderation_status = 'active'::text));


ALTER VIEW public.active_skills OWNER TO postgres;

--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_tokens (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text NOT NULL,
    token_hash text NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.api_tokens OWNER TO postgres;

--
-- Name: auth_identities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_identities (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    provider_username text DEFAULT ''::text NOT NULL,
    provider_email text DEFAULT ''::text NOT NULL,
    provider_avatar_url text DEFAULT ''::text NOT NULL,
    raw_claims jsonb,
    last_login_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_open_id text DEFAULT ''::text NOT NULL,
    provider_union_id text DEFAULT ''::text NOT NULL,
    provider_tenant_key text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.auth_identities OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: skill_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.skill_comments (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.skill_comments OWNER TO postgres;

--
-- Name: skill_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.skill_versions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    skill_id uuid NOT NULL,
    version text NOT NULL,
    changelog text DEFAULT ''::text,
    files jsonb NOT NULL,
    parsed jsonb,
    content_hash text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.skill_versions OWNER TO postgres;

--
-- Name: TABLE skill_versions; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.skill_versions IS '存储技能的版本信息';


--
-- Name: COLUMN skill_versions.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skill_versions.version IS '语义化版本号（如 1.0.0）';


--
-- Name: COLUMN skill_versions.changelog; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skill_versions.changelog IS '版本变更日志';


--
-- Name: COLUMN skill_versions.files; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skill_versions.files IS '文件元数据数组，包含 path, size, storage_key, sha256, content_type';


--
-- Name: COLUMN skill_versions.parsed; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skill_versions.parsed IS '解析后的 SKILL.md frontmatter';


--
-- Name: COLUMN skill_versions.content_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.skill_versions.content_hash IS '所有文件内容哈希的组合哈希，用于版本比对';


--
-- Name: user_stars; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_stars (
    user_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_stars OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    github_id bigint,
    handle text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    avatar_url text DEFAULT ''::text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    password_hash text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    activation_code text,
    activation_expires_at timestamp with time zone,
    auth_provider text DEFAULT 'github'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text DEFAULT ''::text NOT NULL,
    pending_email text DEFAULT ''::text NOT NULL,
    has_bound_email boolean DEFAULT false NOT NULL,
    email_verified_at timestamp with time zone
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: auth_identities auth_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_pkey PRIMARY KEY (id);


--
-- Name: auth_identities auth_identities_provider_provider_subject_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_provider_provider_subject_key UNIQUE (provider, provider_subject);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: skill_comments skill_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skill_comments
    ADD CONSTRAINT skill_comments_pkey PRIMARY KEY (id);


--
-- Name: skill_versions skill_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_pkey PRIMARY KEY (id);


--
-- Name: skill_versions skill_versions_skill_id_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_skill_id_version_key UNIQUE (skill_id, version);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: skills skills_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_slug_key UNIQUE (slug);


--
-- Name: user_stars user_stars_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_stars
    ADD CONSTRAINT user_stars_pkey PRIMARY KEY (user_id, skill_id);


--
-- Name: users users_github_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_github_id_key UNIQUE (github_id);


--
-- Name: users users_handle_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_handle_key UNIQUE (handle);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_api_tokens_token_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_tokens_token_hash ON public.api_tokens USING btree (token_hash);


--
-- Name: idx_api_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_tokens_user_id ON public.api_tokens USING btree (user_id);


--
-- Name: idx_skill_comments_skill_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skill_comments_skill_created_at ON public.skill_comments USING btree (skill_id, created_at DESC);


--
-- Name: idx_skill_comments_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skill_comments_user_id ON public.skill_comments USING btree (user_id);


--
-- Name: idx_skill_versions_content_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skill_versions_content_hash ON public.skill_versions USING btree (content_hash);


--
-- Name: idx_skill_versions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skill_versions_created_at ON public.skill_versions USING btree (created_at DESC);


--
-- Name: idx_skill_versions_skill_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skill_versions_skill_id ON public.skill_versions USING btree (skill_id);


--
-- Name: idx_skills_description_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skills_description_trgm ON public.skills USING gin (description public.gin_trgm_ops);


--
-- Name: idx_skills_display_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skills_display_name_trgm ON public.skills USING gin (display_name public.gin_trgm_ops);


--
-- Name: idx_skills_highlighted_active_updated_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skills_highlighted_active_updated_id ON public.skills USING btree (updated_at DESC, id DESC) WHERE ((is_deleted = false) AND (moderation_status = 'active'::text) AND (is_highlighted = true));


--
-- Name: idx_skills_owner_not_deleted_updated_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skills_owner_not_deleted_updated_at ON public.skills USING btree (owner_user_id, updated_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_skills_owner_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skills_owner_user_id ON public.skills USING btree (owner_user_id);


--
-- Name: idx_skills_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_skills_slug ON public.skills USING btree (slug);


--
-- Name: idx_skills_slug_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_skills_slug_unique ON public.skills USING btree (slug) WHERE (is_deleted = false);


--
-- Name: idx_user_stars_skill_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_stars_skill_id ON public.user_stars USING btree (skill_id);


--
-- Name: users_pending_email_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_pending_email_unique ON public.users USING btree (pending_email) WHERE (pending_email <> ''::text);


--
-- Name: skills update_skills_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: api_tokens api_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: auth_identities auth_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: skill_comments skill_comments_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skill_comments
    ADD CONSTRAINT skill_comments_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_comments skill_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skill_comments
    ADD CONSTRAINT skill_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: skill_versions skill_versions_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skills skills_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_stars user_stars_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_stars
    ADD CONSTRAINT user_stars_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: user_stars user_stars_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_stars
    ADD CONSTRAINT user_stars_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict QEDafGlBhvkR4WJQ4tgW1LSkGc5rwXxqNQCn7sGtP0GKcb38Q8hg7xisiJgxhKd
