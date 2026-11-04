// REC — widget para o iPhone (app Scriptable, gratuito). Cole uma vez; o desenho vem do app a cada atualização.
// Configurar: Ajustes do REC → Widget do iPhone (o código copiado de lá já vem com o endereço certo).
const APP = 'https://SEU-APP.workers.dev';

const fm = FileManager.local(), file = fm.joinPath(fm.documentsDirectory(), 'rec-widget-core.js');
try { fm.writeString(file, await new Request(`${APP}/widget-core.js?t=${Date.now()}`).loadString()); } catch (e) { /* sem rede: usa a última versão baixada */ }
let widget;
if (fm.fileExists(file)) {
  const draw = importModule(file);
  widget = await draw(APP, config.runsInWidget ? config.widgetFamily : 'medium');
} else {
  widget = new ListWidget(); widget.addText('REC: sem conexão');
}
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
