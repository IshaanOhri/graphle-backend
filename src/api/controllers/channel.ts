/* eslint-disable no-await-in-loop */
import { Request, Response } from 'express';
import cryptoRandomString, { async } from 'crypto-random-string';
import Pusher from 'pusher';
import fetch from 'node-fetch';
import Channel from '../../modals/Channel';
import { code, message } from '../../config/messages';
import { ChannelInterface } from '../../interfaces/Channel';
import logger from '../../logger/config';
import Story from '../../modals/Story';
import { StoryInterface } from '../../interfaces/Story';
import { StorySnippet } from '../../interfaces/Story-Snippet';

const pusher = new Pusher({
	appId: String(process.env.PUSHER_APP_ID),
	key: String(process.env.PUSHER_KEY),
	secret: String(process.env.PUSHER_SECRET),
	cluster: String(process.env.PUSHER_CLUSTER),
	useTLS: true
});

const createChannel = async (req: Request, res: Response) => {
	if (!req.body.channelName || !req.body.instructorName) {
		res.status(404).send({
			success: false,
			code: code.wrongParameters,
			message: message.wrongParameters
		});
		return;
	}

	let channelID = '';

	let unique: boolean = false;

	while (!unique) {
		channelID = cryptoRandomString({ length: 6, type: 'distinguishable' });
		const exist = await Channel.findOne({ channelID });
		if (!exist) {
			unique = true;
		}
	}

	const channelInfo: ChannelInterface = {
		channelID,
		channelName: req.body.channelName,
		instructorName: req.body.instructorName,
		participantIDs: []
	};

	try {
		await Channel.create(channelInfo);
	} catch (err) {
		logger.error(err);
		res.status(500).send({
			success: false,
			code: code.channelCreation,
			message: message.channelCreation
		});
		return;
	}

	const storyInfo: StoryInterface = {
		channelID,
		channelName: req.body.channelName,
		instructorName: req.body.instructorName,
		story: []
	};

	try {
		await Story.create(storyInfo);
	} catch (err) {
		logger.error(err);
		res.status(500).send({
			success: false,
			code: code.channelCreation,
			message: message.channelCreation
		});
		return;
	}

	res.send({
		success: true,
		channelInfo: {
			channelID: channelInfo.channelID,
			channelName: channelInfo.channelName,
			instructorName: channelInfo.instructorName
		}
	});
};

const reciteStory = async (req: Request, res: Response) => {
	if (!req.body.channelID || !req.body.query) {
		res.status(404).send({
			success: false,
			code: code.wrongParameters,
			message: message.wrongParameters
		});
		return;
	}

	const { channelID, query } = req.body;

	// SEND QUERY TO DL MODEL
	const body = {
		caption: query.toLowerCase()
	};

	const urls: string[] = [];

	fetch('http://52.146.69.140:5000/generateMultipleImages', {
		method: 'post',
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' }
	})
		.then((response) => response.json())
		.then(async (json) => {
			urls.push(json.bird.img1.large);
			urls.push(json.bird.img2.large);
			urls.push(json.bird.img3.large);
			urls.push(json.bird.img4.large);
			urls.push(json.bird.img5.large);
			urls.push(json.bird.img6.large);

			// Send to all active connections
			try {
				pusher.trigger(`presence-${channelID}`, 'my-event', {
					message: {
						query,
						urls
					}
				});
			} catch (err) {
				logger.error(err);
			}

			const snippet: StorySnippet = {
				query,
				urls,
				createdAt: Date.now()
			};

			try {
				const story: any = await Story.findOne({ channelID });
				story.story.push(snippet);

				await story.save();
			} catch (err) {
				logger.error(err);
				logger.error({
					success: false,
					code: code.storyBackup,
					message: message.storyBackup
				});
			}
		})
		.catch((err) => {
			logger.error(err);
		});

	res.send({
		success: true,
		query
	});
};

export { createChannel, reciteStory };