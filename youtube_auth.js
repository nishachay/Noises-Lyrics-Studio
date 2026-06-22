const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ============================================================================
// SETUP INSTRUCTIONS FOR USER:
// 1. Go to https://console.cloud.google.com/
// 2. Create a new Project.
// 3. Go to "APIs & Services" -> "Library" -> Enable "YouTube Data API v3".
// 4. Go to "OAuth consent screen", set it to External, add your email as a Test user.
// 5. Go to "Credentials" -> "Create Credentials" -> "OAuth client ID".
// 6. Choose "Web application". 
// 7. Add Authorized redirect URI: "http://localhost:3000/api/youtube-callback"
// 8. Copy Client ID and Client Secret into a `.env` file in the project root.
// ============================================================================

// Load environment variables from .env file if it exists
try {
  const dotenvPath = path.join(__dirname, '.env');
  if (fs.existsSync(dotenvPath)) {
    const envConfig = fs.readFileSync(dotenvPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
      if (line.trim() && !line.trim().startsWith('#')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = val;
        }
      }
    });
  }
} catch (e) {
  console.warn('Error reading .env file in youtube_auth.js:', e.message);
}

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3000/api/youtube-callback';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly' // Useful for getting channel name
];

const TOKENS_DIR = path.join(__dirname, 'tokens');
if (!fs.existsSync(TOKENS_DIR)) {
  fs.mkdirSync(TOKENS_DIR);
}

function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/**
 * Generates an Auth URL. The user clicks this, selects their Brand Channel, and approves.
 */
function getAuthUrl(channelIdLabel) {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: channelIdLabel // e.g. "pop", "hiphop" so the callback knows which token file to save
  });
}

/**
 * Handles the OAuth callback, gets the refresh token, and saves it to tokens/<channel>.json
 */
async function handleCallback(code, channelIdLabel) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  if (tokens.refresh_token) {
    // Attempt to fetch the real channel name
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    try {
      const res = await youtube.channels.list({ part: 'snippet', mine: true });
      if (res.data.items && res.data.items.length > 0) {
        tokens.channel_name = res.data.items[0].snippet.title;
      }
    } catch (e) {
      console.log('Error fetching channel name:', e.message);
    }

    fs.writeFileSync(
      path.join(TOKENS_DIR, `${channelIdLabel}.json`), 
      JSON.stringify(tokens)
    );
    return true;
  }
  return false;
}

/**
 * Checks if a specific channel is already authenticated (has a token file).
 */
function isChannelAuthenticated(channelIdLabel) {
  const tokenPath = path.join(TOKENS_DIR, `${channelIdLabel}.json`);
  if (fs.existsSync(tokenPath)) {
    try {
      const t = JSON.parse(fs.readFileSync(tokenPath));
      return { authenticated: true, name: t.channel_name || null };
    } catch(e) {}
  }
  return { authenticated: false, name: null };
}

// --- Auto-Scheduler State ---
const SCHEDULE_FILE = path.join(__dirname, 'scheduled_dates.json');
const QUOTA_FILE = path.join(__dirname, 'quota.json');
const DAILY_STATUS_FILE = path.join(__dirname, 'daily_status.json');

function getTodayString() {
  // Use PT for YouTube quota (which resets at midnight PT)
  const d = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"});
  const ptDate = new Date(d);
  return `${ptDate.getFullYear()}-${ptDate.getMonth()+1}-${ptDate.getDate()}`;
}

function getQuota() {
  if (fs.existsSync(QUOTA_FILE)) {
    const q = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    if (q.date === getTodayString()) {
      return q.usage;
    }
  }
  return 0; // Fresh quota
}

function addQuota(amount) {
  const usage = getQuota() + amount;
  fs.writeFileSync(QUOTA_FILE, JSON.stringify({ date: getTodayString(), usage }));
  return usage;
}

function getDailyStatus() {
  if (fs.existsSync(DAILY_STATUS_FILE)) {
    const s = JSON.parse(fs.readFileSync(DAILY_STATUS_FILE, 'utf8'));
    // Local date for daily pipeline
    const today = new Date().toISOString().split('T')[0];
    if (s.date === today) {
      return s.channels || {};
    }
  }
  return {};
}

function markDailyStatus(channelLabel) {
  const today = new Date().toISOString().split('T')[0];
  const s = { date: today, channels: getDailyStatus() };
  s.channels[channelLabel] = true;
  fs.writeFileSync(DAILY_STATUS_FILE, JSON.stringify(s, null, 2));
}

function getNextPublishTime(channelLabel, dryRun = false) {
  let scheduleState = {};
  if (fs.existsSync(SCHEDULE_FILE)) {
    scheduleState = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
  }

  const now = new Date();
  let targetHour = 0; let targetMin = 0;
  switch(channelLabel.toLowerCase()) {
    case 'kpop': targetHour = 14; targetMin = 30; break;
    case 'hindi': targetHour = 18; targetMin = 0; break;
    case 'dhh': targetHour = 20; targetMin = 0; break;
    case 'pop': targetHour = 21; targetMin = 30; break;
    case 'hiphop': targetHour = 1; targetMin = 30; break;
    default: return null;
  }

  let targetDate = new Date(now);
  targetDate.setHours(targetHour, targetMin, 0, 0);

  if (targetDate.getTime() - now.getTime() < 30 * 60 * 1000) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  if (scheduleState[channelLabel]) {
    const lastScheduled = new Date(scheduleState[channelLabel]);
    if (lastScheduled >= targetDate) {
      targetDate = new Date(lastScheduled);
      targetDate.setMinutes(targetDate.getMinutes() + 30); // Space out by 30 minutes on the same day
    }
  }

  const iso = targetDate.toISOString();
  if (!dryRun) {
    scheduleState[channelLabel] = iso;
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleState, null, 2));
  }

  return iso;
}

function getSchedulePreview(channelLabel) {
  return getNextPublishTime(channelLabel, true);
}

/**
 * Uploads a video to the specified channel.
 */
async function uploadToYouTube({ channelIdLabel, videoPath, thumbnailPath, title, description, tags, publishAtOverride }) {
  const tokenPath = path.join(TOKENS_DIR, `${channelIdLabel}.json`);
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Channel '${channelIdLabel}' is not authenticated. Please authenticate first.`);
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const publishAt = publishAtOverride || getNextPublishTime(channelIdLabel);
  console.log(`[YouTube] Starting upload to channel: ${channelIdLabel}...`);
  if (publishAt) console.log(`[YouTube] Will auto-schedule for: ${publishAt}`);

  const statusObj = {
    privacyStatus: 'private', // Upload as private so it can be scheduled
    selfDeclaredMadeForKids: false
  };
  if (publishAt) {
    statusObj.publishAt = publishAt;
  }

  // 1. Upload Video
  const res = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title,
        description,
        tags: tags || [],
        categoryId: '10' // Music
      },
      status: statusObj
    },
    media: {
      body: fs.createReadStream(videoPath)
    }
  });

  const videoId = res.data.id;
  console.log(`[YouTube] Video uploaded successfully. Video ID: ${videoId}`);

  // 2. Upload Thumbnail (if provided)
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    console.log(`[YouTube] Uploading thumbnail...`);
    try {
      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: fs.createReadStream(thumbnailPath)
        }
      });
      console.log(`[YouTube] Thumbnail set successfully.`);
    } catch (thumbErr) {
      console.log(`[YouTube] WARNING: Could not set thumbnail (Channel might not be phone-verified). Error:`, thumbErr.message);
    }
  }

  // Track quota and daily status after successful upload
  addQuota(1650);
  markDailyStatus(channelIdLabel);

  return `https://studio.youtube.com/video/${videoId}/edit`;
}

module.exports = {
  getAuthUrl,
  handleCallback,
  isChannelAuthenticated,
  uploadToYouTube,
  getSchedulePreview,
  getQuota,
  getDailyStatus,
  getNextPublishTime
};
