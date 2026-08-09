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
window.JATLOG_CONFIG = {
  ENDPOINT: 'COLAR_AQUI_O_URL_DO_APPS_SCRIPT',
  VERSAO: '1.0.0'
};
