# Território ACS — Maria Beatriz

PWA estática, mobile-first, para organização operacional pessoal de ACS. O aplicativo **não substitui o e-SUS Território** e não afirma possuir integração direta com o PEC.

## Executar

Não é necessário Node.js. Sirva a pasta por HTTPS ou servidor estático. Para teste local simples com Python:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`. O Service Worker só é plenamente habilitado em origem segura/localhost.

## Publicar na Vercel

Importe esta pasta como projeto estático, sem comando de build. O arquivo `vercel.json` já define cabeçalhos e fallback.

## CSV reconhecido

O parser foi preparado especificamente para os relatórios “Acompanhamento do território” que possuem linhas de apresentação e filtros antes do cabeçalho real. Reconhece:

- Windows-1252/ANSI (comum na exportação do e-SUS) e UTF-8;
- separador `;`, `,` ou tabulação;
- cabeçalho localizado automaticamente após o preâmbulo;
- datas `DD/MM/AAAA` e `AAAA-MM-DD`;
- microárea no bloco de filtros;
- as colunas `TIPO DE LOGRADOURO`, `LOGRADOURO`, `NÚMERO`, `CEP`, `BAIRRO`, `COMPLEMENTO`, `PONTO DE REFERÊNCIA`, `NOME CIDADÃO`, `SEXO`, `DATA DE NASCIMENTO`, `CPF`, `CNS`, `É O RESPONSÁVEL FAMILIAR?`, `CPF/CNS RESPONSÁVEL FAMILIAR` e `NOME DO RESPONSÁVEL FAMILIAR`.

## Privacidade

Por padrão os dados ficam apenas na memória da sessão. O armazenamento opcional usa PBKDF2 + AES-GCM no navegador. O PIN não é armazenado. O Service Worker salva apenas o shell estático.

## Testes

Abra `tests/test-runner.html` pelo mesmo servidor estático. Não depende de Node.js.

## Limites

Regras clínicas ou periodicidades que dependem de campos não presentes no CSV atual ficam desativadas até que os relatórios correspondentes sejam importados e a regra oficial vigente seja validada. O sistema não deduz condições de saúde por idade, sexo ou outros indícios.
