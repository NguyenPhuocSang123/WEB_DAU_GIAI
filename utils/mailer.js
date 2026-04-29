async function sendTeamStatusEmail({ to, teamName, status, reason }) {
  const isApproved = status === 'approved';
  const subject = isApproved
    ? `[Lien Quan] Doi ${teamName} da duoc duyet`
    : `[Lien Quan] Doi ${teamName} chua duoc duyet`;

  const text = isApproved
    ? `Chuc mung doi ${teamName} da duoc duyet. Vui long theo doi lich thi dau va bang dau tren trang web giai dau.`
    : `Rat tiec, doi ${teamName} chua duoc duyet. Ly do: ${reason || 'Khong co ly do.'}`;

  const preview = {
    from: 'noreply@lienquan.local',
    to,
    subject,
    text,
    sentAt: new Date().toISOString()
  };

  console.log('EMAIL_PREVIEW', JSON.stringify(preview, null, 2));
  return preview;
}

module.exports = {
  sendTeamStatusEmail
};
