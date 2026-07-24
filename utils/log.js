const chalk    = require('chalk');
const gradient = require('gradient-string');

// Theme colors — rX original
const co    = gradient('#243aff', '#4687f0', '#5800d4');
const rxPfx = gradient('#0066ff', '#00aaff', '#0066ff');

// [RX-FCA] prefix — সব log-এ এটা থাকবে
const RX = chalk.bold(rxPfx('[RX-FCA]'));

module.exports = (data, option) => {
  let coloredData = '';

  switch (option) {
    case 'warn':
      coloredData = gradient('#3aed34', '#c2ed34')
        .multiline('[RX-FCA] [ WARN ] - ' + data);
      console.log(chalk.bold(coloredData));
      break;

    case 'error':
      coloredData =
        `${RX} ` +
        chalk.bold.hex('#FF0000')('[ ERROR ] - ') +
        chalk.bold.red(data);
      console.log(coloredData);
      break;

    default:
      coloredData = co(`[RX-FCA] ${option} - ` + data);
      console.log(chalk.bold(coloredData));
      break;
  }
};

module.exports.loader = (data, option) => {
  let coloredData = '';

  switch (option) {
    case 'warn':
      coloredData = co('[RX-FCA] [===== MARIA-V4 =====] - ' + data);
      console.log(chalk.bold(coloredData));
      break;

    case 'error':
      coloredData = `${RX} ` + chalk.bold.red('[ MARIA-V4 ] - ' + data);
      console.log(coloredData);
      break;

    default:
      coloredData = co('[RX-FCA] [ MARIA-V4 ] - ' + data);
      console.log(chalk.bold(coloredData));
      break;
  }
};
