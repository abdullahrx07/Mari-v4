const mongoose = require("mongoose");

// MongoDB replaces the old Sequelize + SQLite setup.
//
// Connection string resolution order:
//   1. MONGODB_URI environment variable / secret (recommended — never
//      committed to disk, works the same in dev and production).
//   2. config.json -> DATABASE.mongodb.uri (convenience for people who
//      would rather keep it in the config file, same as the other API
//      keys already stored in config.json).
mongoose.set("strictQuery", false);

function resolveUri() {
	if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
	try {
		const config = require("../../config.json");
		const configUri = config && config.DATABASE && config.DATABASE.mongodb && config.DATABASE.mongodb.uri;
		if (configUri) return configUri;
	} catch (e) {
		// config.json missing/unreadable — fall through to the error below.
	}
	return null;
}

async function connect() {
	const uri = resolveUri();
	if (!uri) {
		throw new Error(
			"No MongoDB connection string found. Set the MONGODB_URI secret, or fill in DATABASE.mongodb.uri in config.json, before starting the bot."
		);
	}
	if (mongoose.connection.readyState === 1) return mongoose.connection;
	await mongoose.connect(uri, {
		serverSelectionTimeoutMS: 15000
	});
	return mongoose.connection;
}

module.exports = { mongoose, connect };
