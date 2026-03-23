-- migration: vapi_public_key
-- Adiciona suporte para armazenar a chave pública Vapi (usada para testes de assistente via WebRTC).
ALTER TABLE vapi_connections
  ADD COLUMN IF NOT EXISTS encrypted_public_key TEXT;
