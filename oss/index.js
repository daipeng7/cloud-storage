const AliOSS = require('./AliOSS');
const config = require('./config');

const uploadOSS = new AliOSS({
	oss: config.view,
	customFolder: config.view.customFolder,
	cdn: `${config.cdn}sprite/`
});

module.exports = uploadOSS;
