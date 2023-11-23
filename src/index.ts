/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Feed } from 'feed';

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

interface Status {
	id: string;
	created_at: string;
	url: string;
	content: string;
    reblog: Status;
    spoiler_text: string;
    in_reply_to_id: string;
    media_attachments: MediaAttachment[];
	account: {
	  display_name: string;
	  acct: string;
	};
}

interface MediaAttachment {
    type: string;
    url: string;
}

interface FeedItem {
    title: string;
    id: string;
    link: string;
    content: string;
    date: Date;
}

const usage = `
Usage: /{instance_url}/{access_token} 
eg. /mastodon/mastodon.social/1234567890abcdef

Note:
1. Currently only Mastodon / Mastodon-API-compatible platforms (gotosocial etc.) are supported.
2. An access_token is a credential for accessing your account. Any entity possessing the access_token can request the corresponding API in your name. It is strongly recommended that you deploy this project yourself, regularly check the usage of your account, and rotate your access_token periodically.
`;

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/') {
            return new Response(usage, { status: 200 });
        }

        const [instance_url, access_token] = url.pathname.split('/').slice(1);
        // Return 404 if instance_url or access_token is missing
        if (!instance_url || !access_token) {
            return new Response('Not Found', { status: 404 });
        }
        const endpoint = `https://${instance_url}/api/v1/timelines/home`;
        const headers = { 
            'Authorization': `Bearer ${access_token}`,
            'User-Agent': 'Fedi Timeline RSS Worker',
            'Accept': 'application/json',
        };

        const response = await fetch(endpoint, { headers });
        if (!response.ok) {
            return new Response(response.statusText, { status: response.status });
        }

        const statuses = await response.json() as Status[];
        const feed = new Feed({
            title: `${instance_url} timeline`,
            id: instance_url,
            link: instance_url,
            updated: new Date(),
            generator: 'Fedi Timeline RSS Worker',
			copyright: 'Powered by Fedi Timeline RSS Worker, created by Owu One. All rights reserved to the original author of the statuses in this feed.',
        });

        for (const status of statuses) {
            const item = await statusToItem(status, instance_url, access_token);
            feed.addItem(item);
        }
        feed.items.sort((a, b) => b.date.getTime() - a.date.getTime());

        return new Response(feed.rss2(), {
            headers: { 'Content-Type': 'application/rss+xml' },
        });
    },
};

async function getStatus(instance_url: string, access_token: string, id: string): Promise<Status> {
    const endpoint = `https://${instance_url}/api/v1/statuses/${id}`;
    const headers = { 
        'Authorization': `Bearer ${access_token}`,
        'User-Agent': 'Fedi Timeline RSS Worker',
        'Accept': 'application/json',
    };

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
        return {} as Status;
    }

    return await response.json() as Status;
}

function getName(status: Status): string {
    if (status.account.display_name) {
        return status.account.display_name;
    } else if (status.account.acct) {
        return status.account.acct;
    } else {
        return 'UNKNOWN';
    }
}

function statusToItem(status: Status, instance_url: string, access_token: string): Promise<FeedItem> {
    return new Promise(async (resolve, reject) => {
        let content = status.content;
        let actualStatus = status;

        // Reblog check
        if (status.reblog) {
            actualStatus = status.reblog;
            const name = getName(actualStatus);
            content = `<p>RT ${name}</p>${actualStatus.content}`;
        }

        // Spoiler check
        if (actualStatus.spoiler_text) {
            content = `<p><strong>Spoiler: ${actualStatus.spoiler_text}</strong></p>${content}`;
        }

        // Reply check
        if (actualStatus.in_reply_to_id) {
            const repliedStatus = await getStatus(instance_url, access_token, actualStatus.in_reply_to_id);
            const name = getName(repliedStatus);
            if (repliedStatus.account) {
                content = `<p>Reply to ${name}:</p>${content}`;
            }
        }

        // Add media attachments
        if (actualStatus.media_attachments && actualStatus.media_attachments.length > 0) {
            for (const media of actualStatus.media_attachments) {
                content += '<br>';
                switch (media.type) {
                    case 'image':
                        content += `<img src="${media.url}" alt="Image attachment">`;
                        break;
                    case 'video':
                        content += `<video src="${media.url}" controls>Video attachment</video>`;
                        break;
                    case 'gifv':
                        content += `<video src="${media.url}" autoplay loop muted playsinline>Video attachment</video>`;
                        break;
                    case 'audio':
                        content += `<audio src="${media.url}" controls>Audio attachment</audio>`;
                        break;
                }
            }
        }

        resolve({
            title: getName(status),
            id: status.id,
            link: status.url,
            content: content,
            date: new Date(status.created_at),
        });
    });
}
