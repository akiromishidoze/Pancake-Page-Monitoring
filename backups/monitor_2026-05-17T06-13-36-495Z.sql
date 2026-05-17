--
-- PostgreSQL database dump
--

\restrict 77jebHOWyfHu8yrgGQm3chwbVgXjcZfaETwfIOb1gkMAPJLmbjeMAddceS40J6F

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: endpoints; Type: TABLE; Schema: public; Owner: jm
--

CREATE TABLE public.endpoints (
    id text NOT NULL,
    name text NOT NULL,
    url text,
    api_key text NOT NULL,
    access_token text,
    shop_label text,
    token_expires_at text,
    is_active integer DEFAULT 1 NOT NULL,
    created_at text NOT NULL,
    last_used_at text
);


ALTER TABLE public.endpoints OWNER TO jm;

--
-- Name: page_states; Type: TABLE; Schema: public; Owner: jm
--

CREATE TABLE public.page_states (
    id integer NOT NULL,
    run_id text NOT NULL,
    page_id text NOT NULL,
    shop_label text,
    page_name text,
    activity_kind text,
    is_activated integer,
    is_canary integer,
    activation_reason text,
    state_change text,
    activity_kind_change text,
    hours_since_last_order real,
    hours_since_last_customer_activity real,
    response_ms real,
    fetch_errors integer,
    customer_count integer,
    generated_at text NOT NULL
);


ALTER TABLE public.page_states OWNER TO jm;

--
-- Name: page_states_id_seq; Type: SEQUENCE; Schema: public; Owner: jm
--

CREATE SEQUENCE public.page_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.page_states_id_seq OWNER TO jm;

--
-- Name: page_states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: jm
--

ALTER SEQUENCE public.page_states_id_seq OWNED BY public.page_states.id;


--
-- Name: platform_connectors; Type: TABLE; Schema: public; Owner: jm
--

CREATE TABLE public.platform_connectors (
    id text NOT NULL,
    name text NOT NULL,
    platform_type text NOT NULL,
    api_url text NOT NULL,
    auth_header text,
    auth_token text,
    json_path text,
    interval_ms integer DEFAULT 60000 NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
);


ALTER TABLE public.platform_connectors OWNER TO jm;

--
-- Name: platform_pages; Type: TABLE; Schema: public; Owner: jm
--

CREATE TABLE public.platform_pages (
    id text NOT NULL,
    endpoint_id text NOT NULL,
    page_name text NOT NULL,
    page_url text,
    is_active integer DEFAULT 1 NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
);


ALTER TABLE public.platform_pages OWNER TO jm;

--
-- Name: runs; Type: TABLE; Schema: public; Owner: jm
--

CREATE TABLE public.runs (
    run_id text NOT NULL,
    endpoint_id text,
    generated_at text NOT NULL,
    received_at text NOT NULL,
    heartbeat_ok integer,
    run_quality text,
    severity text,
    canary_status text,
    canary_alert integer,
    outage_suspected integer,
    alert_count integer,
    rule_version integer,
    in_maintenance_window integer,
    total_pages integer,
    active_pages integer,
    inactive_pages integer,
    receiver_sd_size_bytes integer,
    raw_summary text
);


ALTER TABLE public.runs OWNER TO jm;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: jm
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL
);


ALTER TABLE public.settings OWNER TO jm;

--
-- Name: page_states id; Type: DEFAULT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.page_states ALTER COLUMN id SET DEFAULT nextval('public.page_states_id_seq'::regclass);


--
-- Data for Name: endpoints; Type: TABLE DATA; Schema: public; Owner: jm
--

COPY public.endpoints (id, name, url, api_key, access_token, shop_label, token_expires_at, is_active, created_at, last_used_at) FROM stdin;
\.


--
-- Data for Name: page_states; Type: TABLE DATA; Schema: public; Owner: jm
--

COPY public.page_states (id, run_id, page_id, shop_label, page_name, activity_kind, is_activated, is_canary, activation_reason, state_change, activity_kind_change, hours_since_last_order, hours_since_last_customer_activity, response_ms, fetch_errors, customer_count, generated_at) FROM stdin;
\.


--
-- Data for Name: platform_connectors; Type: TABLE DATA; Schema: public; Owner: jm
--

COPY public.platform_connectors (id, name, platform_type, api_url, auth_header, auth_token, json_path, interval_ms, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: platform_pages; Type: TABLE DATA; Schema: public; Owner: jm
--

COPY public.platform_pages (id, endpoint_id, page_name, page_url, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: runs; Type: TABLE DATA; Schema: public; Owner: jm
--

COPY public.runs (run_id, endpoint_id, generated_at, received_at, heartbeat_ok, run_quality, severity, canary_status, canary_alert, outage_suspected, alert_count, rule_version, in_maintenance_window, total_pages, active_pages, inactive_pages, receiver_sd_size_bytes, raw_summary) FROM stdin;
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: jm
--

COPY public.settings (key, value) FROM stdin;
retention_days	90
auth_email	admin
auth_password	admin
session_token	519831b8-c2e5-4400-87a1-e5ac80f3b74f
last_scheduled_run	1778998416493
\.


--
-- Name: page_states_id_seq; Type: SEQUENCE SET; Schema: public; Owner: jm
--

SELECT pg_catalog.setval('public.page_states_id_seq', 1, false);


--
-- Name: endpoints endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.endpoints
    ADD CONSTRAINT endpoints_pkey PRIMARY KEY (id);


--
-- Name: page_states page_states_pkey; Type: CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.page_states
    ADD CONSTRAINT page_states_pkey PRIMARY KEY (id);


--
-- Name: platform_connectors platform_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.platform_connectors
    ADD CONSTRAINT platform_connectors_pkey PRIMARY KEY (id);


--
-- Name: platform_pages platform_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.platform_pages
    ADD CONSTRAINT platform_pages_pkey PRIMARY KEY (id);


--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (run_id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: page_states_kind_time; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX page_states_kind_time ON public.page_states USING btree (activity_kind, generated_at DESC);


--
-- Name: page_states_page_id_time; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX page_states_page_id_time ON public.page_states USING btree (page_id, generated_at DESC);


--
-- Name: page_states_run_id; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX page_states_run_id ON public.page_states USING btree (run_id);


--
-- Name: platform_connectors_active; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX platform_connectors_active ON public.platform_connectors USING btree (is_active);


--
-- Name: platform_pages_endpoint_idx; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX platform_pages_endpoint_idx ON public.platform_pages USING btree (endpoint_id);


--
-- Name: runs_endpoint_id_idx; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX runs_endpoint_id_idx ON public.runs USING btree (endpoint_id);


--
-- Name: runs_generated_at_idx; Type: INDEX; Schema: public; Owner: jm
--

CREATE INDEX runs_generated_at_idx ON public.runs USING btree (generated_at DESC);


--
-- Name: page_states page_states_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.page_states
    ADD CONSTRAINT page_states_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(run_id) ON DELETE CASCADE;


--
-- Name: platform_pages platform_pages_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.platform_pages
    ADD CONSTRAINT platform_pages_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.endpoints(id) ON DELETE CASCADE;


--
-- Name: runs runs_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: jm
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.endpoints(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict 77jebHOWyfHu8yrgGQm3chwbVgXjcZfaETwfIOb1gkMAPJLmbjeMAddceS40J6F

