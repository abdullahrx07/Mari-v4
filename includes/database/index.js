const mongoose = require("mongoose");

// MongoDB replaces the old Sequelize + SQLite setup. Connection string is
// read from the MONGODB_URI environment variable (never hardcoded/committed
// — see update.md / replit.md for how it's configured on this project).
mongoose.set("strictQuery", false);

async function connect() {
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		throw new Error(
			"MONGODB_URI environment variable is not set. Add a MongoDB connection string as an environment secret before starting the bot."
		);
	}
	if (mongoose.connection.readyState === 1) return mongoose.connection;
	await mongoose.connect(uri, {
		serverSelectionTimeoutMS: 15000
	});
	return mongoose.connection;
}

module.exports = { mongoose, connect };
