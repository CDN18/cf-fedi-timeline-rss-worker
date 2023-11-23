# Fediverse Timeline RSS
Turn your home timeline in fediverse into a RSS feed in real-time. Powered by Cloudflare Workers.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/CDN18/cf-fedi-timeline-rss-worker)

## Note
1. Currently only Mastodon / Mastodon-API-compatible platforms (gotosocial etc.) are supported. PRs welcome!(for implementing RSS generation for other fediverse platforms)
2. **An access_token is a credential for accessing your account. Any entity possessing the access_token can request the corresponding API on your behalf. It is strongly recommended that you deploy this project yourself, regularly check the usage of your account, and rotate your access_token periodically.**

## Usage
1. Create an app in your instance settings and copy the access token. (Check the `read` scope)
2. Your RSS feed is `https://<workers_url>/<instance_url>/<access_token>`
