const { Schema } = require("mongoose");

module.exports = function ({ mongoose }) {
	const schema = new Schema(
		{
			userID: { type: String, unique: true, required: true, index: true },
			name: { type: String },
			data: { type: Schema.Types.Mixed, default: {} }
		},
		{ timestamps: true }
	);

	return mongoose.models.Users || mongoose.model("Users", schema);
};
