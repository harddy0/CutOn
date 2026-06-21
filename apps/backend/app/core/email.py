import logging

import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: sib_api_v3_sdk.TransactionalEmailsApi | None = None


def _get_email_client() -> sib_api_v3_sdk.TransactionalEmailsApi:
    """Lazy-init and return the Brevo transactional email API client."""
    global _client
    if _client is None:
        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key["api-key"] = settings.brevo_api_key
        _client = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )
    return _client


def send_password_reset_email(recipient_email: str, reset_link: str) -> None:
    """Send a password-reset email via Brevo.

    Parameters
    ----------
    recipient_email:
        The user's email address.
    reset_link:
        The fully qualified URL the user clicks to reset their password
        (e.g. ``https://app.cuton.com/reset-password?token=xxx&email=yyy``).
    """
    client = _get_email_client()

    html_content = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f7;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7; padding: 40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="padding: 40px 32px 24px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
<h1 style="color: #ffffff; font-size: 24px; margin: 0;">Reset Your Password</h1>
</td></tr>
<tr><td style="padding: 32px;">
<p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
You recently requested to reset your password for your <strong>CutOn</strong> account.
Click the button below to set a new password. This link expires in {settings.reset_token_expire_minutes} minutes.
</p>
<table cellpadding="0" cellspacing="0" style="margin: 0 auto 24px;">
<tr><td align="center" style="background-color: #667eea; border-radius: 8px; padding: 12px 32px;">
<a href="{reset_link}" style="color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; display: inline-block;">Reset Password</a>
</td></tr>
</table>
<p style="color: #a0aec0; font-size: 14px; line-height: 1.5; margin: 0;">
If you did not request a password reset, you can safely ignore this email.
</p>
</td></tr>
<tr><td style="padding: 24px 32px; background-color: #f8f9fa; text-align: center;">
<p style="color: #a0aec0; font-size: 12px; margin: 0;">
&copy; {settings.project_name} &mdash; All-in-one AI study companion
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        sender={
            "name": settings.email_from_name,
            "email": settings.email_from_address,
        },
        to=[{"email": recipient_email}],
        subject="Reset your CutOn password",
        html_content=html_content,
    )

    try:
        client.send_transac_email(send_smtp_email)
        logger.info("Password-reset email sent to %s", recipient_email)
    except ApiException as exc:
        logger.error(
            "Failed to send password-reset email to %s: %s",
            recipient_email,
            exc,
        )
        raise
