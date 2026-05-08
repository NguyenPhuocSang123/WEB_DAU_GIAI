/**
 * Tournament Bracket Generator
 * Generates a single-elimination tournament bracket with randomly shuffled teams
 */

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getNextPowerOfTwo(num) {
  let power = 1;
  while (power < num) {
    power *= 2;
  }
  return power;
}

function createBracketStructure(teams) {
  const totalTeams = teams.length;
  const bracketSize = getNextPowerOfTwo(totalTeams);
  const rounds = Math.log2(bracketSize);
  
  // Shuffle teams for random bracket
  const shuffledTeams = shuffleArray(teams);
  
  // Create matches for the first round
  const matches = [];
  
  for (let i = 0; i < bracketSize; i += 2) {
    const team1 = i < totalTeams ? shuffledTeams[i] : null;
    const team2 = i + 1 < totalTeams ? shuffledTeams[i + 1] : null;
    
    matches.push({
      matchId: 'round-1-match-' + (i / 2 + 1),
      round: 1,
      team1: team1 ? { name: team1.name, id: team1._id } : null,
      team2: team2 ? { name: team2.name, id: team2._id } : null,
      winner: null,
      matchNumber: i / 2 + 1
    });
  }
  
  return {
    totalTeams,
    bracketSize,
    totalRounds: rounds,
    matches,
    teamsShuffled: shuffledTeams.map(t => ({ name: t.name, id: t._id }))
  };
}

function generateBracketHTML(bracketData) {
  const { matches, totalRounds, totalTeams, bracketSize } = bracketData;
  
  let html = '<div class="bracket-container">\n';
  
  // Group matches by round
  const matchesByRound = {};
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!matchesByRound[match.round]) {
      matchesByRound[match.round] = [];
    }
    matchesByRound[match.round].push(match);
  }
  
  // Render first round
  html += '<div class="bracket-round">\n';
  html += '<h3>Vòng 1 (' + matchesByRound[1].length + ' trận)</h3>\n';
  html += '<div class="matches">\n';
  
  const round1Matches = matchesByRound[1] || [];
  for (let i = 0; i < round1Matches.length; i++) {
    const match = round1Matches[i];
    html += '<div class="match" data-match-id="' + match.matchId + '">\n';
    html += '<div class="team team-1">' + (match.team1 ? match.team1.name : 'Chờ...') + '</div>\n';
    html += '<div class="vs">vs</div>\n';
    html += '<div class="team team-2">' + (match.team2 ? match.team2.name : 'Chờ...') + '</div>\n';
    html += '</div>\n';
  }
  
  html += '</div>\n';
  html += '</div>\n';
  
  // Note about other rounds
  if (totalRounds > 1) {
    html += '<div class="bracket-note">\n';
    html += '<p style="text-align: center; color: #999; margin-top: 20px;">\n';
    html += 'Sơ đồ trận đấu được tạo ngẫu nhiên. Còn ' + (totalRounds - 1) + ' vòng tiếp theo sẽ được cập nhật khi có kết quả.\n';
    html += '</p>\n';
    html += '</div>\n';
  }
  
  html += '</div>\n';
  
  return html;
}

function generateBracketHTMLFromMatches(matches, teamsById) {
  if (!matches || matches.length === 0) return '';

  // Group matches by round
  const matchesByRound = {};
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!matchesByRound[match.round]) {
      matchesByRound[match.round] = [];
    }
    matchesByRound[match.round].push(match);
  }

  const maxRound = Math.max(...Object.keys(matchesByRound));

  let html = '<div class="bracket-container">\n';

  for (let round = 1; round <= maxRound; round++) {
    const roundMatches = matchesByRound[round] || [];
    if (roundMatches.length === 0) continue;

    html += '<div class="bracket-round">\n';
    html += '<h3>Vòng ' + round + ' (' + roundMatches.length + ' trận)</h3>\n';
    html += '<div class="matches">\n';

    for (let j = 0; j < roundMatches.length; j++) {
      const match = roundMatches[j];
      const homeLabel = getSlotLabel(match.homeSlotType, match.homeTeamId, match.homeFromMatchId, teamsById, matches);
      const awayLabel = getSlotLabel(match.awaySlotType, match.awayTeamId, match.awayFromMatchId, teamsById, matches);

      html += '<div class="match" data-match-id="' + match._id + '">\n';
      html += '<div class="team team-1">' + homeLabel + '</div>\n';
      html += '<div class="vs">vs</div>\n';
      html += '<div class="team team-2">' + awayLabel + '</div>\n';
      if (match.startAt) {
        const date = new Date(match.startAt);
        html += '<div class="match-time">' + date.toLocaleString('vi-VN') + '</div>\n';
      }
      html += '</div>\n';
    }

    html += '</div>\n';
    html += '</div>\n';
  }

  html += '</div>\n';

  return html;
}

function getSlotLabel(slotType, teamId, fromMatchId, teamsById, matches) {
  if (slotType === 'team') {
    return teamId && teamsById[String(teamId)] ? teamsById[String(teamId)].name : 'TBD';
  } else if (slotType === 'winner') {
    const fromMatch = matches.find(function(m) { return String(m._id) === String(fromMatchId); });
    if (fromMatch) {
      return 'Người thắng V' + fromMatch.round + '-T' + fromMatch.matchIndex;
    }
    return 'Người thắng trận trước';
  }
  return 'Chờ...';
}

module.exports = {
  shuffleArray: shuffleArray,
  getNextPowerOfTwo: getNextPowerOfTwo,
  createBracketStructure: createBracketStructure,
  generateBracketHTML: generateBracketHTML,
  generateBracketHTMLFromMatches: generateBracketHTMLFromMatches
};