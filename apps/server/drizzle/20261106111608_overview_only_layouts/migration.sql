-- Only Panoramica is a widget board now: the saved layouts of the other zones are never shown again.
DELETE FROM `desk_layouts` WHERE `zone` <> 'overview';
