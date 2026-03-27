// Supabase Edge Function: OGP対応シェアページ (Parallel Coordinates)
// SNSクローラーにはOGPメタタグを返し、人間のユーザーには302リダイレクトする
//
// デプロイ: supabase functions deploy og-parallel-coordinates-share --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEPLOY_ORIGIN = "https://parallel-coordinates.dataviz.jp";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BOT_UA_PATTERN = /Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Slackbot|Discordbot|LINE|Googlebot|bingbot/i;

function escapeToAsciiHtml(str: string): string {
  let result = "";
  for (const ch of str) {
    const code = ch.codePointAt(0)!;
    if (ch === "&") result += "&amp;";
    else if (ch === '"') result += "&quot;";
    else if (ch === "<") result += "&lt;";
    else if (ch === ">") result += "&gt;";
    else if (code > 127) result += `&#x${code.toString(16)};`;
    else result += ch;
  }
  return result;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("Missing id parameter", { status: 400 });
  }

  const shareUrl = `${DEPLOY_ORIGIN}/share.html?id=${id}`;
  const ua = req.headers.get("user-agent") || "";

  // 人間のブラウザには302リダイレクト
  if (!BOT_UA_PATTERN.test(ua)) {
    return new Response(null, {
      status: 302,
      headers: { "Location": shareUrl },
    });
  }

  // SNSクローラーにはOGPメタタグを返す
  const { data: share } = await supabase
    .from("parallel_coordinates_shares")
    .select("title")
    .eq("id", id)
    .single();

  const ogTitle = escapeToAsciiHtml(share?.title || "Parallel Coordinates");
  const ogDesc = escapeToAsciiHtml("Parallel Coordinates Chart \u2014 dataviz.jp");
  const siteName = escapeToAsciiHtml("Parallel Coordinates");
  const ogImage = `${SUPABASE_URL}/storage/v1/object/public/parallel-coordinates-og-images/${id}.png`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta property="og:type" content="website">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:site_name" content="${siteName}">
<meta property="og:url" content="${shareUrl}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<meta name="twitter:image" content="${ogImage}">
<title>${ogTitle}</title>
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
