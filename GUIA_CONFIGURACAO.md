# Guia de Configuração: Passo a Passo do Zero (Ponto 0)

Este guia descreve todos os campos e passos necessários para configurar e rodar sua primeira campanha no Vapi-dialer.

---

## 1. Configuração da Conexão Vapi (Ponto Inicial)

Antes de tudo, o sistema precisa se comunicar com sua conta na Vapi.

**Onde acessar:** Menu lateral → **Configuração Vapi**

### Campos Necessários:
- **Label:** Um nome para identificar esta chave (ex: "Produção", "Vapi Principal").
- **Vapi API Key (privada):** Sua chave secreta que começa com `sk_live_...`. Você a encontra no Dashboard da Vapi em *Settings* -> *API Keys*.

### Passos:
1. Insira o **Label**.
2. Cole a **API Key**.
3. Clique em **Salvar Key**.

---

## 2. Limite de Concorrência da Organização

A Vapi limita quantas chamadas você pode fazer ao mesmo tempo com base no seu plano.

**Onde acessar:** Mesma página de **Configuração Vapi**.

### Campos:
- **Slots simultâneos da org Vapi:** Insira o número total de chamadas que seu plano Vapi permite (ex: 10, 50, 100).

> [!IMPORTANT]
> O sistema distribuirá estes slots automaticamente entre todas as suas campanhas ativas. Se você colocar um número maior do que seu plano permite, a Vapi retornará erro nas chamadas excedentes.

---

## 3. Sincronização do Assistente (Webhook)

Para que o dashboard receba os dados de quando a chamada termina, você deve sincronizar seu assistente.

### Passos:
1. Copie a **URL do Webhook** exibida na página de Configuração Vapi.
2. No campo **Selecionar assistente**, escolha o assistente que você vai usar.
3. Clique em **Atualizar no Assistente**.
   - *Isso configurará automaticamente o "Server URL" no dashboard da Vapi para você.*

---

## 4. Configuração do Critério de Sucesso (Assistente)

Isso define quando uma chamada é considerada "Convertida" ou "Sucesso" nos relatórios.

**Onde acessar:** Lista de **Assistentes configurados** (abaixo na página de Configuração Vapi).

### Campos:
- **Nome legível:** Nome que aparecerá nos relatórios (ex: "Agente de Vendas").
- **Campo de conversão:** O nome da variável no *Structured Output* do Vapi (ex: `quer_agendar`, `venda_concluida`).
- **Valor de sucesso:** O valor que essa variável precisa ter para ser sucesso (ex: `sim`, `true`).

---

## 5. Criação de Lista de Leads

As listas organizam seus contatos. É obrigatório que cada lead tenha um número de telefone válido.

### Opções de Importação:

#### A. Importar CSV/XLSX (Recomendado)
1. Clique em **Importar CSV/XLSX**.
2. **Campos Sugeridos**: Suas colunas devem conter, de preferência, cabeçalhos claros. O sistema tenta sugerir automaticamente:
   - `phone` / `telefone` / `celular` → Mapeado para **phone** (obrigatório).
   - `name` / `nome` → Mapeado para **name**.
   - `empresa` / `company` → Mapeado para **company**.
3. **Mapeamento Customizado**: Se a coluna não for reconhecida, você pode escolher:
   - **manter nome original**: Salva o dado mas não o associa aos campos padrão.
   - **ignorar coluna**: A coluna não será importada.
4. **Resumo**: O sistema reportará "X leads importados, Y duplicatas ignoradas".

#### B. Adição Manual
1. Use para testes rápidos.
2. Clique em **Adicionar Lead**.
3. **Campos**:
   - **Telefone**: Formato internacional `+5511999990000` ou local `11999990000`.
   - **Primeiro nome**: Usado para a variável `{{first_name}}` no robô.
   - **Campos Extras**: Você pode criar campos como `produto`, `valor_divida`, etc. Eles ficam disponíveis no robô como `{{produto}}`, `{{valor_divida}}`.

#### C. Webhook de Entrada (Integração Direta)
1. Útil para n8n ou Zapier.
2. O sistema gera uma **URL única** e um **Webhook Secret**.
3. **Headers**: `Authorization: Bearer [Seu Secret]`.
4. **Body (JSON)**:
   ```json
   { "phone": "+5511999990000", "first_name": "João", "custom_field": "valor" }
   ```

---

## 6. Criação da Campanha (Fila de Discagem)

A campanha é onde a mágica acontece. O sistema opera em um **Wizard de 3 passos**.

### Passo 1: Configuração e Inteligência
- **Assistente Vapi**: O assistente que conduzirá a conversa.
- **Número de Telefone**: O número de saída que o cliente verá (Caller ID).
- **Configurações Avançadas (Crucial):**
  - **Concorrência (1 a 5)**: Quantas pessoas o sistema tenta chamar ao mesmo tempo. 
    - *Ex: Se for 5, o sistema manterá sempre 5 linhas ativas enquanto houver leads.* 
  - **Máx. tentativas (1 a 10)**: Quantas vezes o lead será redisado se não atender ou der ocupado.
  - **Intervalo entre tentativas (min)**: Tempo mínimo de espera antes de tentar o mesmo número novamente.
  - **Limite por dia**: Quantas vezes o sistema pode tentar o mesmo número em 24h.
  - **Janela de Horário**:
    - **Fuso Horário**: Padrão `America/Sao_Paulo`.
    - **Início/Fim**: Ex: `09:00` às `18:00`.
    - **Dias**: Selecione quais dias o sistema está autorizado a ligar.
  - **Webhook de Saída**: URL para receber os dados quando a chamada for finalizada (ex: para atualizar seu CRM).

### Passo 2: Seleção de Leads
- Selecione uma lista de leads existente ou crie uma nova no momento através do upload de CSV.

### Passo 3: Revisão e Disparo
- Verifique o resumo: Assistente, Número e Quantidade de Leads.
- **Iniciar imediatamente**: Se ativado, o sistema começa a discar no segundo que você clicar em Criar.

---

## 7. Painel de Controle e Status

Enquanto a campanha roda, você verá os seguintes estados para cada lead:
- **Novo**: Ainda não foi processado.
- **Aguardando (Queued)**: Está na fila para ser discado.
- **Em ligação**: Atualmente chamando ou em conversa.
- **Concluído**: Chamada finalizada com os dados coletados.
- **Falhou**: Esgotou as tentativas ou erro técnico.
- **Não ligar (Do Not Call)**: Marcado para exclusão de discagem.
- **Callback agendado**: Programado para nova tentativa em horário específico.
