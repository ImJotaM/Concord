# 🚀 Guia de Release e Geração do Executável (.exe) do Concord

Este guia explica as duas formas de gerar o executável `.exe` instalador do **Concord**:

---

## 🌟 Método 1: Geração Automática pelo GitHub Actions (Recomendado)

Você não precisa instalar o compilador Rust nem ferramentas C++ no seu computador. O GitHub Actions compila tudo na nuvem e entrega o instalador pronto para download.

### Opção A — Criando uma Tag / Release via Git:
No terminal, execute:
```bash
git add .
git commit -m "chore: release v1.0.0"
git push origin main

# Cria a tag e envia para o GitHub
git tag v1.0.0
git push origin v1.0.0
```

### Opção B — Disparo Manual pelo GitHub:
1. Acesse o seu repositório no GitHub: `https://github.com/ImJotaM/Concord`.
2. Vá até a aba **Actions**.
3. Selecione o workflow **Release Concord Desktop**.
4. Clique em **Run workflow**, digite a versão desejada (ex: `v1.0.0`) e clique no botão verde.
5. Em poucos minutos, a compilação será finalizada e uma nova **Release** será criada com os arquivos `.exe` (Instalador NSIS) e `.msi` para download!

---

## 💻 Método 2: Compilando Localmente no Windows

Se você preferir compilar o executável diretamente na sua máquina Windows:

### 1. Pré-requisitos
* **Node.js**: v20+ instalado.
* **Rust & Cargo**: Baixe e instale pelo [rustup.rs](https://rustup.rs/) executando o `rustup-init.exe`.
* **C++ Build Tools**: Instalados pelo instalador do Visual Studio (C++ Desktop Development workload).

### 2. Comandos de Build
No terminal do projeto, execute:
```bash
# 1. Instalar dependências da raiz e do servidor
npm install
npm --prefix server install

# 2. Compilar o frontend e o servidor
npm run build:all

# 3. Compilar o executável desktop (.exe)
npm run tauri:build
```

O executável `.exe` e o instalador gerados estarão localizados em:
`src-tauri/target/release/bundle/nsis/Concord_1.0.0_x64-setup.exe`

---

## 🌐 Como Funciona Hostear o Servidor pelo `.exe`

Sim! Ao abrir o aplicativo `.exe`, você tem total controle:

1. **Hostear Servidor com 1 Clique**:
   * Clique no botão **"Host Local Server"** na barra lateral ou no modal de Host.
   * O aplicativo inicia o processo do servidor Concord em segundo plano na porta `3000`.
   * Os logs do servidor, status em tempo real e os IPs da sua rede local (Wi-Fi/Ethernet) são exibidos diretamente na interface.
   * O servidor transmite via **mDNS / Bonjour**, permitindo que seus amigos na mesma rede local descubram seu servidor automaticamente pela tela de "Discover LAN Servers" sem precisar digitar IP manualmente.

2. **Entrar no Servidor de um Amigo**:
   * Se um amigo na mesma rede Wi-Fi/cabo já estiver hosteando, você abre o seu `.exe`, clica em **"Discover LAN Servers"** (ou digita o IP dele com a porta `:3000`) e entra instantaneamente com voz, vídeo, DMs e chat!

---

## 📦 Estrutura dos Arquivos de Release

* `src-tauri/tauri.conf.json`: Configurações de janela, ícones, bundle NSIS e metadados.
* `src-tauri/Cargo.toml`: Configuração do pacote Rust e dependências de compilação.
* `.github/workflows/release.yml`: Pipeline de automação CI/CD para compilação multiplataforma.
