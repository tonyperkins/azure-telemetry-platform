export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Determine target based on the path.
    // ManagementEndpoints calls /auth/realms/opensky-network/protocol/openid-connect/token
    // OpenSkyFeedService calls /api/states/all
    let targetDomain = "opensky-network.org";
    if (url.pathname.startsWith("/auth/")) {
      targetDomain = "auth.opensky-network.org";
    }

    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetDomain;

    // Create a new request object to forward
    const proxyRequest = new Request(targetUrl, request);
    
    // Scrub identifying headers that hyperscaler proxies (like Cloudflare) append.
    // OpenSky blocks based on origin ASN, and Cloudflare's edge IPs are generally accepted.
    proxyRequest.headers.delete("cf-connecting-ip");
    proxyRequest.headers.delete("x-forwarded-for");
    proxyRequest.headers.delete("x-real-ip");

    // Fetch the response from OpenSky
    const response = await fetch(proxyRequest);
    
    // Forward the response back to Azure
    return response;
  },
};
