// Returns the VAPID public key so the client can subscribe. Public by design.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || "" });
}
