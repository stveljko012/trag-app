-- Runs once, on first start of an empty volume.
CREATE ROLE traccar LOGIN PASSWORD 'traccar';
CREATE DATABASE traccar OWNER traccar;

CREATE ROLE trag LOGIN PASSWORD 'trag';
CREATE DATABASE trag OWNER trag;
CREATE DATABASE trag_test OWNER trag;
