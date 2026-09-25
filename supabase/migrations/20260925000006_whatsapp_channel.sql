-- WhatsApp is the primary customer channel: deep links opened from the admin, sent by hand.
alter type notification_channel add value if not exists 'whatsapp';
