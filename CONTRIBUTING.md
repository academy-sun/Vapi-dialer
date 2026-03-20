# Fluxo de trabalho — Call X

## Regra principal

**NUNCA commitar direto na branch `main`.** Todo código vai para `staging` primeiro.

## Fluxo correto

1. Faça suas alterações localmente
2. Commit e push para `staging`:
   ```bash
   git add <arquivos>
   git commit -m "feat: descrição da mudança"
   git push origin staging
   ```
3. Aguarde o deploy automático do Vercel (preview URL gerada para a branch `staging`)
4. Teste na URL de staging
5. Se aprovado, merge para `main`:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```

## URLs

- **Produção**: https://vapi-dialer-one.vercel.app
- **Staging**: gerada automaticamente pelo Vercel para a branch `staging` (formato: `vapi-dialer-git-staging-*.vercel.app`)

## Branch protection (GitHub)

A branch `main` deve ter proteção ativada em **Settings → Branches → Branch protection rules**:
- Require pull request before merging
- Require status checks to pass before merging

Isso impede pushes diretos para produção.

## Criando uma nova feature

```bash
# Certifique-se de estar em staging
git checkout staging
git pull origin staging

# Faça as alterações...
git add <arquivos>
git commit -m "feat: minha feature"
git push origin staging

# Teste → aprovado → merge para main
git checkout main
git merge staging
git push origin main
git checkout staging  # voltar para staging para continuar trabalhando
```
