/* JatLog — configuração da instalação (comum aos módulos).
 *
 * ENDPOINT: o URL da aplicação web do Apps Script (termina em /exec). São
 *   scripts diferentes, um por conjunto de folhas:
 *     JATLOG_CONFIG   -> colheita  (Tanheia/Linhas e 7 de Abril/Blocos)
 *     INDIAREC_CONFIG -> medições  (NBF (Tanheia) 26)
 *     PESAGEM_CONFIG  -> pesagem de sacos de sementes (Tanheia, temporário)
 *     INDIA17_CONFIG  -> peso da colheita por mês (Índia 17) — ENDPOINT vazio
 *                        até o Kaz publicar o Apps Script deste separador
 *                        (ele próprio escreve e implanta este, ver HANDOVER.md)
 *
 *   Ao voltar a publicar um script use "Gerir implementações > editar > nova
 *   versão", NUNCA "Nova implementação" — isso muda o URL e os telemóveis já
 *   instalados deixam de conseguir enviar.
 *
 * O código de activação NÃO fica aqui: este ficheiro é público. Cada telemóvel
 * escreve-o uma vez no primeiro arranque e fica guardado no aparelho.
 */
/* `self` e nao `window`: o Service Worker tambem carrega este ficheiro
   (importScripts) e la nao existe `window`. Numa pagina, self === window. */
self.JATLOG_CONFIG = {
  ENDPOINT: 'https://script.google.com/macros/s/AKfycby8UglcSQTwm-joEEWqB4dJ8IoNUOrfuDJ-ChOCSpzQjn_q5-SCuUM_uNK0wFXPFn6-0w/exec',
  VERSAO: '2.0.0'
};

self.INDIAREC_CONFIG = {
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbxNPOm3OJoVADngytixFlnukdfpSo0wYth70BkWi3scfG3Hq21QrLY46bnfkcD6tuEV/exec',
  VERSAO: '2.0.0'
};

self.PESAGEM_CONFIG = {
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbwyl19ZOvaDkrAY6SYCYBWoF_8O1e1GjRkYddM9HhJ-qFCSXvjdIA84zjQv6U5jCUdQ/exec',
  VERSAO: '1.0.0'
};

self.INDIA17_CONFIG = {
  ENDPOINT: '',
  VERSAO: '1.0.0'
};
