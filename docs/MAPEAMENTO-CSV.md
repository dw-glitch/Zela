# Mapeamento CSV

O importador procura a linha de cabeçalho em qualquer posição inicial do arquivo, em vez de assumir que é a primeira linha. Aliases são normalizados removendo acentos, espaços extras e diferenças de caixa. Exportações Windows-1252 são decodificadas corretamente. Datas brasileiras são interpretadas explicitamente como dia/mês/ano; datas ambíguas fora dos formatos suportados não são convertidas silenciosamente.
