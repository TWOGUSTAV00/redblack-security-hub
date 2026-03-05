# Cloud Runbook

Este arquivo concentra as informacoes operacionais para rodar o projeto na nuvem.

## Producao atual
- Plataforma: Render
- Repositorio: https://github.com/TWOGUSTAV00/redblack-security-hub
- URL publica: https://redblack-security-hub.onrender.com/
- Branch de deploy: master

## Configuracao do servico (Render)
- Build Command: pip install -r requirements.txt
- Start Command: gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120
- Health Check Path: /
- Auto-Deploy: ON

## Variaveis de ambiente obrigatorias
- SECRET_KEY = (definir no Render Environment)
- PORT = (fornecida automaticamente pelo Render)

## Arquivos de deploy no repositorio
- render.yaml
- Procfile
- app.py (usa porta dinamica por PORT)

## Fluxo de atualizacao
1. Fazer commit no GitHub (branch master).
2. Render faz deploy automatico (Auto-Deploy ON).
3. Validar acesso em / e login.

## Observacoes
- Nao versionar segredos no GitHub.
- Plano Free pode hibernar por inatividade.
- Para disponibilidade continua 24h sem hibernacao: plano pago no provedor.
