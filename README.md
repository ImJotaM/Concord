# Concord

Plataforma de comunicação em tempo real para redes locais (LAN), projetada para operação totalmente independente da internet. A aplicação combina chat de texto, chamadas de voz de baixa latência, compartilhamento de tela, mensagens diretas e ferramentas integradas em uma interface moderna para desktop e navegadores web.

## Visão Geral

O Concord permite que qualquer computador em uma rede local (Wi-Fi ou cabeada) atue como servidor central, possibilitando a conexão instantânea de outros dispositivos (computadores, notebooks, tablets e smartphones) sem depender de conexões externas, servidores em nuvem ou serviços de terceiros.

A comunicação de áudio utiliza conexões ponto a ponto diretas via WebRTC, garantindo latência mínima e alta fidelidade sonora. Todos os dados, arquivos e históricos permanecem salvos exclusivamente no dispositivo anfitrião.

## Funcionalidades

### Comunicação de Voz e Vídeo
- **Canais de Voz de Baixa Latência**: Transmissão em malha distribuída via WebRTC com processamento de sinal em tempo real (supressão de ruído, cancelamento de eco e controle automático de ganho).
- **Detecção de Atividade de Voz (VAD)**: Indicadores visuais de fala em tempo real e controles individuais de volume por participante.
- **Compartilhamento de Tela**: Transmissão de janelas ou telas completas com suporte a captura de áudio do sistema.
- **Controles de Áudio**: Ativação e desativação rápida de microfone, ensurdecimento e teste de entrada de áudio.

### Mensagens e Colaboração
- **Canais de Texto por Servidor**: Organização em canais temáticos com suporte a mensagens em tempo real via WebSockets.
- **Mensagens Diretas (DMs)**: Conversas privadas entre usuários conectados com histórico persistido.
- **Sistema de Amigos**: Lista de contatos locais com monitoramento de presença e status de atividade.
- **Envio de Arquivos e Mídias**: Compartilhamento local de fotos, documentos e mídias com visualização integrada no chat.
- **Gerenciamento de Cargos e Permissões**: Criação e atribuição de papéis com níveis distintos de moderação e acesso.

### Ferramentas Integradas
- **Navegador Web Embutido**: Navegação multiabas com suporte a busca rápida, mecanismos de pesquisa customizáveis e proxy local integrado.
- **Painel de Efeitos Sonoros (Soundboard)**: Reprodução de efeitos de áudio sincronizados diretamente nas salas de voz.
- **Descoberta Automática de Rede (mDNS)**: Localização automática do servidor host na rede local sem necessidade de inserção manual de endereços IP.
- **Armazenamento Persistente com SQLite**: Banco de dados relacional local com suporte ao modo WAL para alto desempenho e integridade transacional.

## Tecnologias Utilizadas

- **Frontend**: Svelte 5 (Runes), Tailwind CSS, Lucide Icons, Vite
- **Desktop Shell**: Tauri v2, Rust
- **Servidor Local**: Node.js, Express, WebSockets (`ws`), mDNS / Zeroconf
- **Banco de Dados**: SQLite (`node:sqlite` / `better-sqlite3`)
- **Protocolos de Mídia**: WebRTC, Web Audio API

## Requisitos de Sistema

- **Node.js**: Versão 18.0 ou superior
- **npm**: Gerenciador de pacotes padrão do Node.js
- **Rust & Cargo**: Necessário apenas para compilar o executável desktop via Tauri

## Instalação e Execução

### 1. Clonar o Repositório
```bash
git clone https://github.com/ImJotaM/Concord.git
cd Concord
```

### 2. Instalar as Dependências
Instale as dependências da aplicação principal e do servidor interno:
```bash
npm install
npm --prefix server install
```

### 3. Executar em Ambiente de Desenvolvimento
Para iniciar simultaneamente o servidor local (`http://localhost:3000`) e a interface web (`http://localhost:5173`):
```bash
npm run start:all
```

Para iniciar no modo seguro (HTTPS) com certificado local, permitindo acesso ao microfone via dispositivos externos na rede:
```bash
npm run start:https
```

### 4. Executar o Aplicativo Desktop (Tauri)
Para iniciar a versão desktop nativa em modo de desenvolvimento:
```bash
npm run tauri dev
```

Para gerar o instalador de produção executável (`.exe` no Windows):
```bash
npm run tauri build
```

## Acesso por Dispositivos na Rede Local

1. Inicie o servidor em um dos computadores conectados à rede local.
2. Identifique o endereço IP local do computador host exibido no terminal ou no painel de descoberta do Concord (exemplo: `http://192.168.1.100:5173`).
3. Em qualquer outro computador, celular ou tablet conectado à mesma rede Wi-Fi ou cabo, abra o endereço no navegador web.

## Comandos Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor de desenvolvimento do frontend (Vite) |
| `npm run dev:https` | Inicia o frontend com suporte a HTTPS local |
| `npm run server` | Inicia o servidor local de sinalização e banco de dados |
| `npm run start:all` | Executa o servidor e o cliente web simultaneamente |
| `npm run start:https` | Executa o servidor e o cliente web com protocolo HTTPS |
| `npm run build` | Gera os arquivos otimizados do frontend para produção |
| `npm run build:all` | Compila os bundles de produção do frontend e do servidor |
| `npm run tauri dev` | Inicia a aplicação nativa desktop em modo de desenvolvimento |
| `npm run tauri build` | Compila o binário e instalador final da aplicação desktop |
| `npm run check` | Executa a validação estática de tipos e componentes Svelte |

## Privacidade e Segurança

O Concord foi concebido sob o princípio de isolamento total de rede:
- Nenhum dado de telemetria, mensagens ou áudio é enviado para servidores externos.
- Toda a sinalização e tráfego de dados ocorrem estritamente dentro da rede local.
- O controle dos dados e arquivos gerados pertence integralmente ao usuário que hospeda o servidor.
