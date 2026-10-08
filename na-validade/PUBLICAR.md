# Como publicar o Na Validade (grátis, para testes)

Ao final, o app fica num endereço como `https://navalidade.onrender.com`, que abre em qualquer celular, com cadeado (a câmera funciona).

Você vai usar 3 serviços grátis:

| Serviço | Para quê |
|---|---|
| **GitHub** (github.com) | Guarda o código |
| **Neon** (neon.tech) | Banco de dados (PostgreSQL) |
| **Render** (render.com) | Roda o app e dá o endereço |

Tempo: uns 20 minutos.

---

## 0. Instalar o Git (só uma vez)

- **Windows:** baixe em https://git-scm.com/download/win e instale com as opções padrão.
- **Mac:** abra o Terminal e digite `git --version`. Se pedir para instalar, aceite.

Depois, no terminal do VS Code (menu **Terminal → Novo Terminal**), diga ao Git quem é você (só uma vez):

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

## 1. Abrir o projeto no VS Code

1. Descompacte o `na-validade.zip`.
2. No VS Code: **Arquivo → Abrir Pasta…** e escolha a pasta `na-validade`.
3. Abra o terminal: **Terminal → Novo Terminal**. Os comandos abaixo são digitados nele.

## 2. Colocar o código no GitHub

1. Entre em https://github.com e crie uma conta (se ainda não tiver).
2. Clique em **+ → New repository**.
   - **Repository name:** `na-validade`
   - Marque **Private** (importante: só vocês veem o código).
   - **Não** marque "Add a README", nem .gitignore, nem licença.
   - Clique em **Create repository**.
3. No terminal do VS Code, rode um comando por vez, trocando `SEU-USUARIO` pelo seu usuário do GitHub:

```bash
git remote add origin https://github.com/SEU-USUARIO/na-validade.git
git branch -M main
git push -u origin main
```

Na primeira vez, vai abrir uma janela para entrar no GitHub. É só autorizar.

Atualize a página do repositório: os arquivos devem aparecer.

## 3. Criar o banco de dados no Neon

1. Entre em https://neon.tech e crie uma conta (pode usar a conta do GitHub ou do Google).
2. Crie um projeto:
   - **Name:** `navalidade`
   - **Postgres version:** 16 (ou a mais nova)
   - **Region:** a mais próxima do Brasil que aparecer (ex.: *AWS São Paulo* ou *US East*).
3. Na tela do projeto, clique em **Connect**.
4. **Desligue** a opção **Connection pooling** (o app precisa da conexão direta).
5. Copie o texto que começa com `postgresql://...`. Esse é o **endereço do banco**. Guarde para o próximo passo.
   - Ele contém a senha do banco: não mande para ninguém nem coloque no código.

## 4. Publicar no Render

1. Entre em https://render.com e crie uma conta **com o GitHub** (assim ele já enxerga o repositório).
2. Clique em **New → Blueprint**.
3. Escolha o repositório `na-validade`. (Se não aparecer, clique em **Configure GitHub** e libere o acesso a ele.)
4. O Render lê o arquivo `render.yaml` do projeto e mostra o serviço **navalidade** (plano Free).
5. Ele vai pedir o valor de **DATABASE_URL**: cole o endereço do banco do passo 3.
6. Clique em **Apply** (ou **Deploy Blueprint**).
7. Aguarde a publicação (uns 5 minutos na primeira vez). Quando aparecer **Live**, o endereço fica no topo da página, algo como `https://navalidade.onrender.com`.

Abra esse endereço no celular, crie a conta e use. Dica: no menu do navegador, toque em **Adicionar à tela inicial**.

> Se o nome `navalidade` já estiver em uso no Render, ele cria com um final diferente (ex.: `navalidade-x1y2.onrender.com`).

---

## Como atualizar depois

Quando eu te mandar uma versão nova, substitua os arquivos na pasta (mantendo a pasta `.git`) e rode:

```bash
git add -A
git commit -m "Atualização"
git push
```

O Render publica sozinho em alguns minutos.

## Bom saber (plano grátis)

- Depois de uns 15 minutos sem ninguém usar, o app "dorme". O primeiro acesso depois disso demora de 30 a 60 segundos; depois fica normal.
- O plano grátis do Neon é pequeno, mas suficiente para testes.
- Os limites dos planos grátis podem mudar: confira nos sites.
- Para usar na rede toda, o ideal é passar para um plano pago do Render (a partir de uns US$ 7/mês) e, se quiserem, um domínio próprio (`.com.br`, uns R$ 40/ano).

## Se der erro

- **No Render, o deploy falhou:** abra a aba **Logs**, copie as últimas linhas e me mande.
- **"password authentication failed" ou "unsupported startup parameter":** confira se copiou o endereço do Neon inteiro e com **Connection pooling desligado**. Depois, em Render → **Environment**, corrija o `DATABASE_URL` e clique em **Save, rebuild and deploy**.
- **`git push` pediu usuário e senha:** a senha do GitHub não funciona no terminal. Instale o GitHub Desktop ou use o botão **Sign in with browser** que aparece no VS Code.
