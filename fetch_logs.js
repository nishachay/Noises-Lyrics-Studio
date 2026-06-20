const fs = require('fs');
const axios = require('axios');
const path = require('path');

async function fetchLogs() {
  try {
    const token = fs.readFileSync(path.join(__dirname, 'github_token.txt'), 'utf8').trim();
    
    // Get latest workflow runs
    const runsRes = await axios.get('https://api.github.com/repos/Nishachay/Noises-Lyrics-Studio/actions/runs', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const failedRuns = runsRes.data.workflow_runs.filter(r => r.conclusion === 'failure');
    if (failedRuns.length === 0) {
      console.log('No failed runs found.');
      return;
    }

    const latestFailed = failedRuns[0];
    console.log(`Latest failed run ID: ${latestFailed.id}`);

    // Get jobs for the run
    const jobsRes = await axios.get(latestFailed.jobs_url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const failedJob = jobsRes.data.jobs.find(j => j.conclusion === 'failure');
    if (!failedJob) {
      console.log('No failed jobs found in the run.');
      return;
    }

    console.log(`Failed job name: ${failedJob.name}`);
    console.log(`Failed step: ${failedJob.steps.find(s => s.conclusion === 'failure')?.name}`);

    // Fetch the raw log for the job
    const logRes = await axios.get(`https://api.github.com/repos/Nishachay/Noises-Lyrics-Studio/actions/jobs/${failedJob.id}/logs`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    console.log('--- LOG START ---');
    const logs = logRes.data.split('\n');
    console.log(logs.slice(-50).join('\n')); // Print last 50 lines
    console.log('--- LOG END ---');

  } catch (e) {
    console.error('Error fetching logs:', e.response ? e.response.data : e.message);
  }
}

fetchLogs();
