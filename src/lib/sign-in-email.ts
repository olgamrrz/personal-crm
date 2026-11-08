// The sign-in email: subject, HTML and plain text. A pure function, so tests check the wording without sending anything.
// The text is shown to the user, so it is in Russian. Mail clients ignore the app's design tokens,
// so the colors here are written out.

export const SIGN_IN_LINK_MINUTES = 15;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSignInEmail(url: string) {
  const subject = "Вход в Личную CRM";
  const term = `Ссылка работает ${SIGN_IN_LINK_MINUTES} минут и открывается один раз.`;
  const ignore = "Если вы не запрашивали вход - просто проигнорируйте письмо";
  const safeUrl = escapeHtml(url);

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">Вход в Личную CRM</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Нажмите на кнопку, чтобы войти.</p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;background:#1c1917;color:#ffffff;border-radius:8px;font-size:16px;text-decoration:none;">Войти</a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#57534e;">${term}</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#57534e;">${ignore}</p>
    </div>
  </body>
</html>`;

  const text = `Вход в Личную CRM

Чтобы войти, откройте ссылку:
${url}

${term}
${ignore}
`;

  return { subject, html, text };
}
