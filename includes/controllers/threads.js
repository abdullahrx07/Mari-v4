module.exports = function ({ models, api }) {
	const Threads = models.use('Threads');

	function toPlain(doc) {
		if (!doc) return false;
		const obj = doc.toObject({ versionKey: false });
		obj.num = obj._id;
		return obj;
	}

	async function getInfo(threadID) {
		try {
			const result = await api.getThreadInfo(threadID);
			return result;
		}
		catch (error) {
			console.log(error);
			throw new Error(error);
		};
	}

	async function getAll(...data) {
		var where = {}, attributes;
		for (const i of data) {
			if (typeof i != 'object') throw global.getText("threads", "needObjectOrArray");
			if (Array.isArray(i)) attributes = i;
			else where = i;
		}
		try {
			const query = Threads.find(where);
			if (attributes) query.select(attributes.join(' '));
			return (await query.exec()).map(toPlain);
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function getData(threadID) {
		try {
			const data = await Threads.findOne({ threadID: String(threadID) });
			return toPlain(data);
		}
		catch (error) {
			console.error(error);
            throw new Error(error);
		}
	}

	async function setData(threadID, options = {}) {
		if (typeof options != 'object' && !Array.isArray(options)) throw global.getText("threads", "needObject");
		try {
			const doc = await Threads.findOneAndUpdate({ threadID: String(threadID) }, { $set: options });
			if (!doc) throw new Error("not_found");
			return true;
		} catch (error) {
			try{
				await this.createData(threadID, options);

			} catch (error) {
				console.error(error);
				throw new Error(error);
			}

		}
	}

	async function delData(threadID) {
		try {
			await Threads.deleteOne({ threadID: String(threadID) });
			return true;
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	async function createData(threadID, defaults = {}) {
		if (typeof defaults != 'object' && !Array.isArray(defaults)) throw global.getText("threads", "needObject");
		try {
			await Threads.findOneAndUpdate(
				{ threadID: String(threadID) },
				{ $setOnInsert: Object.assign({ threadID: String(threadID) }, defaults) },
				{ upsert: true, new: true, setDefaultsOnInsert: true }
			);
			return true;
		}
		catch (error) {
			console.error(error);
			throw new Error(error);
		}
	}

	return {
		getInfo,
		getAll,
		getData,
		setData,
		delData,
		createData
	};
};
