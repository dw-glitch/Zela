# Zela

PWA estática e mobile-first para dar ao ACS uma visão rápida do território, localizar pessoas sem navegar paciente por paciente e organizar a consulta das visitas a partir das datas realmente presentes nos arquivos importados.

O Zela **não substitui o e-SUS Território**. Ele funciona como um painel visual complementar.

## Experiência principal

A interface foi simplificada para quatro áreas:

- **Painel** — visão imediata do que merece atenção;
- **Visitas** — lista filtrável por situação e busca por nome ou rua;
- **Pessoas** — busca rápida em todo o território;
- **Dados** — importação e conferência do formato do CSV.

Quando existe uma coluna explícita de próxima visita, o Zela separa:

- visita prevista para hoje ou já vencida;
- visita prevista nos próximos 7 dias;
- visita programada para depois.

Quando existe somente uma coluna de última visita, o Zela mostra quem está há mais tempo sem uma nova visita registrada, mas **não inventa um prazo clínico**.

Quando o arquivo não possui nenhuma data de visita, o painel deixa isso claro em vez de classificar pessoas como atrasadas sem evidência.

## CSV atual validado

O arquivo real de acompanhamento do território usado na validação possui:

- codificação **Windows-1252/ANSI**;
- separador **ponto e vírgula (;)**;
- cabeçalho real após um preâmbulo do e-SUS;
- datas no formato **DD/MM/AAAA**;
- data de geração também em **DD/MM/AAAA**;
- valores de CPF, CNS, CEP e microárea que podem vir precedidos por tabulação dentro de campos entre aspas.

O parser remove essas tabulações sem perder os dígitos e identifica o formato das datas automaticamente.

O relatório atual de acompanhamento do território traz a **data de nascimento**, mas não traz, por si só, uma coluna de última ou próxima visita. Por isso o Zela reconhece também aliases comuns de:

- DATA DA ÚLTIMA VISITA;
- ÚLTIMA VISITA;
- DATA DE VISITA;
- DATA DA PRÓXIMA VISITA;
- PRÓXIMA VISITA;
- DATA PREVISTA DA VISITA;
- RETORNO PREVISTO.

Se outro relatório trouxer uma dessas colunas, o painel de visitas é ativado automaticamente.

## Executar

Não é necessário Node.js para usar o app. Sirva a pasta como site estático por HTTPS ou localhost.

Exemplo opcional com Python:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`.

## Publicar na Vercel

O projeto é estático. Não precisa de comando de build. O `vercel.json` já contém o fallback para `index.html`.

## Privacidade

O CSV é processado no navegador. O fluxo principal não envia o arquivo para serviços externos.

## Testes

Abra `tests/test-runner.html` pelo mesmo servidor estático.

Os testes cobrem:

- DD/MM/AAAA;
- AAAA-MM-DD;
- DD-MM-AAAA;
- cabeçalho após preâmbulo;
- detecção do formato brasileiro;
- reconhecimento de última e próxima visita;
- visita prevista vencida;
- última visita sem transformar automaticamente o registro em atraso.
