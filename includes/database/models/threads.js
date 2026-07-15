const { Schema } = require("mongoose");

module.exports = function ({ mongoose }) {
	const schema = new Schema(
		{
			threadID: { type: String, unique: true, required: true, index: true },
			threadInfo: { type: Schema.Types.Mixed, default: {} },
			data: { type: Schema.Types.Mixed, default: {} }
		},
		{ timestamps: true }
	);

	return mongoose.models.Threads || mongoose.model("Threads", schema);
};
