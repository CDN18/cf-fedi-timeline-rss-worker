/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { handleMastodonRequest } from './mastodon';
import { handleMisskeyRequest } from './misskey';

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

interface Account {
	acct: string;
}

const mastodonCompatibleSoftware = ['mastodon', 'gotosocial', 'pleroma', 'akkoma', 'hometown'];
const misskeyCompatibleSoftware = ['misskey', 'firefish', 'iceshrimp', 'sharkey', 'catodon', 'foundkey'];

const usage = `
使用方法: /{software}/{instance_url}/{access_token} 
或: /{instance_url}/{access_token}

例如: /mastodon/mastodon.social/1234567890abcdef
或: /mastodon.social/1234567890abcdef

注意:
1. 目前支持 Mastodon API 兼容的平台 (${mastodonCompatibleSoftware.join(', ')} 等) 和 Misskey API 兼容的平台 (${misskeyCompatibleSoftware.join(', ')} 等)。
2. access_token 是访问您账户的凭证。拥有 access_token 的任何实体都可以以您的名义请求相应的 API。强烈建议您自行部署此项目，定期检查您的账户使用情况，并定期轮换您的 access_token。

Usage: /{software}/{instance_url}/{access_token} 
or: /{instance_url}/{access_token}

Example: /mastodon/mastodon.social/1234567890abcdef
or: /mastodon.social/1234567890abcdef

Note:
1. Currently supports platforms compatible with Mastodon API (${mastodonCompatibleSoftware.join(', ')} etc.) and Misskey API (${misskeyCompatibleSoftware.join(', ')} etc.).
2. The access_token is the credential for accessing your account. Any entity with the access_token can request the corresponding API on your behalf. It is strongly recommended that you deploy this project yourself, regularly check your account usage, and rotate your access_token periodically.
`;


export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/') {
            return new Response(usage, { status: 200 });
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        let software: string | null = null;
        let instance_url: string;
        let access_token: string;

        if (pathParts.length === 3) {
            [software, instance_url, access_token] = pathParts;
        } else if (pathParts.length === 2) {
            [instance_url, access_token] = pathParts;
        } else {
            return new Response('Invalid request path', { status: 400 });
        }

        if (!software) {
            software = await detectSoftware(instance_url);
        }

        const lowerSoftware = software.toLowerCase();
        if (mastodonCompatibleSoftware.includes(lowerSoftware)) {
            return handleMastodonRequest(instance_url, access_token, env, ctx);
        } else if (misskeyCompatibleSoftware.includes(lowerSoftware)) {
            return handleMisskeyRequest(instance_url, access_token, env, ctx);
        } else {
            // this should never happen
            return new Response('Unsupported software type', { status: 400 });
        }
    },
};

async function detectSoftware(instance_url: string): Promise<string> {
    try {
        const response = await fetch(`https://${instance_url}/nodeinfo/2.0`);
        if (!response.ok) {
            return 'mastodon'; // default to Mastodon
        }
        const nodeInfo = await response.json() as { software?: { name?: string } };
        return nodeInfo.software?.name?.toLowerCase() || 'mastodon';
    } catch (error) {
        console.error('Failed to get nodeinfo:', error);
        return 'mastodon'; // default to Mastodon
    }
}
