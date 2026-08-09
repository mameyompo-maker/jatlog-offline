/* JatLog offline — configuração da instalação.
 *
 * ENDPOINT: o URL da aplicação web do Apps Script (termina em /exec).
 *   Ao voltar a publicar o script use "Gerir implementações > editar > nova versão",
 *   NUNCA "Nova implementação" — isso muda o URL e os telemóveis já instalados
 *   deixam de conseguir enviar.
 *
 * O código de activação NÃO fica aqui: este ficheiro é público. Cada telemóvel
 * escreve-o uma vez no primeiro arranque e fica guardado no aparelho.
 */
/* `self` e nao `window`: o Service Worker tambem carrega este ficheiro
   (importScripts) e la nao existe `window`. Numa pagina, self === window. */
self.JATLOG_CONFIG = {
  ENDPOINT: 'https://script.google.com/macros/s/AKfycby8UglcSQTwm-joEEWqB4dJ8IoNUOrfuDJ-ChOCSpzQjn_q5-SCuUM_uNK0wFXPFn6-0w/exec',
  VERSAO: '1.0.0'
};
