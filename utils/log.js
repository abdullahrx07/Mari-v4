const chalk = require('chalk');
const gradient = require('gradient-string');

// Fixed bY rX
const co = gradient("#243aff", "#4687f0", "#5800d4");
const error = chalk.red.bold;

module.exports = (data, option) => {
  let coloredData = '';

  switch (option) {
    case 'warn':
      coloredData = gradient('#3aed34', '#c2ed34')
        .multiline('[ WARN ] - ' + data);
      console.log(chalk.bold(coloredData));
      break;

    case 'error':
      coloredData =
        chalk.bold.hex('#FF0000')('[ ERROR ] - ') +
        chalk.bold.red(data);
      console.log(coloredData);
      break;

    default:
      coloredData = co(`${option} - ` + data);
      console.log(chalk.bold(coloredData));
      break;
  }
};

module.exports.loader = (data, option) => {
  let coloredData = '';

  switch (option) {
    case 'warn':
      coloredData = co('[===== MARIA-V3 =====] - ' + data);
      console.log(chalk.bold(coloredData));
      break;

    case 'error':
      coloredData = chalk.bold.red('[ MARIA-V3 ] - ' + data);
      console.log(coloredData);
      break;

    default:
      coloredData = co('[ MARIA-V3 ] - ' + data);
      console.log(chalk.bold(coloredData));
      break;
  }
};
