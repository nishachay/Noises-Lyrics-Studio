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

    const latestRun = runsRes.data.workflow_runs[0];
    if (!latestRun) {
      console.log('No runs found.');
      return;
    }

    console.log(`Latest run ID: ${latestRun.id}`);

    // Get jobs for the run
    const jobsRes = await axios.get(latestRun.jobs_url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const firstJob = jobsRes.data.jobs[0];
    if (!firstJob) {
      console.log('No jobs found in the run.');
      return;
    }

    console.log(`Job name: ${firstJob.name}`);

    // Fetch the raw log for the job
    const logRes = await axios.get(`https://api.github.com/repos/Nishachay/Noises-Lyrics-Studio/actions/jobs/${firstJob.id}/logs`, {
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
