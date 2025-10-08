import app from "./app.js";
const PORT = process.env.PORT || 4000;
/**
 * ✅ Vercel akan otomatis menjalankan "export default app"
 * ❌ Jangan pakai app.listen() di Vercel
 */
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 API running locally on http://localhost:${PORT}`);
    });
}
export default app;
