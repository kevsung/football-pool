/* ── fbsTeams.js — FBS (Division I-A) team roster for filtering ──────────── */

// Names match The Odds API format (typically "School Mascot" or just "School").
// Matching is case-insensitive and bidirectional (API name contains identifier
// OR identifier contains API name), so both "Alabama" and "Alabama Crimson Tide"
// resolve to the same school.
const FBS_NAMES = [
  // SEC
  'Alabama Crimson Tide', 'Arkansas Razorbacks', 'Auburn Tigers',
  'Florida Gators', 'Georgia Bulldogs', 'Kentucky Wildcats', 'LSU Tigers',
  'Mississippi State Bulldogs', 'Missouri Tigers', 'Ole Miss Rebels',
  'South Carolina Gamecocks', 'Tennessee Volunteers', 'Texas A&M Aggies',
  'Vanderbilt Commodores', 'Texas Longhorns', 'Oklahoma Sooners',
  // Big Ten
  'Illinois Fighting Illini', 'Indiana Hoosiers', 'Iowa Hawkeyes',
  'Maryland Terrapins', 'Michigan Wolverines', 'Michigan State Spartans',
  'Minnesota Golden Gophers', 'Nebraska Cornhuskers', 'Northwestern Wildcats',
  'Ohio State Buckeyes', 'Oregon Ducks', 'Penn State Nittany Lions',
  'Purdue Boilermakers', 'Rutgers Scarlet Knights', 'UCLA Bruins', 'USC Trojans',
  'Washington Huskies', 'Wisconsin Badgers',
  // Big 12
  'Arizona Wildcats', 'Arizona State Sun Devils', 'Baylor Bears', 'BYU Cougars',
  'UCF Knights', 'Central Florida Knights', 'Cincinnati Bearcats',
  'Colorado Buffaloes', 'Houston Cougars', 'Iowa State Cyclones',
  'Kansas Jayhawks', 'Kansas State Wildcats', 'Oklahoma State Cowboys',
  'TCU Horned Frogs', 'Texas Tech Red Raiders', 'Utah Utes',
  'West Virginia Mountaineers',
  // ACC
  'Boston College Eagles', 'Clemson Tigers', 'Duke Blue Devils',
  'Florida State Seminoles', 'Georgia Tech Yellow Jackets', 'Louisville Cardinals',
  'Miami Hurricanes', 'NC State Wolfpack', 'North Carolina State Wolfpack',
  'North Carolina Tar Heels', 'Pittsburgh Panthers', 'SMU Mustangs',
  'Stanford Cardinal', 'Syracuse Orange', 'Virginia Cavaliers',
  'Virginia Tech Hokies', 'Wake Forest Demon Deacons', 'California Golden Bears',
  // AAC
  'Army Black Knights', 'Charlotte 49ers', 'East Carolina Pirates',
  'Florida Atlantic Owls', 'Memphis Tigers', 'Navy Midshipmen',
  'North Texas Mean Green', 'Rice Owls', 'South Florida Bulls', 'Temple Owls',
  'Tulane Green Wave', 'Tulsa Golden Hurricane', 'UAB Blazers', 'UTSA Roadrunners',
  // Sun Belt
  'Appalachian State Mountaineers', 'Arkansas State Red Wolves',
  'Coastal Carolina Chanticleers', 'Georgia Southern Eagles',
  'Georgia State Panthers', 'James Madison Dukes', 'Louisiana Ragin Cajuns',
  'Louisiana Monroe Warhawks', 'Marshall Thundering Herd', 'Old Dominion Monarchs',
  'South Alabama Jaguars', 'Southern Miss Golden Eagles', 'Texas State Bobcats',
  'Troy Trojans',
  // Conference USA
  'FIU Panthers', 'Florida International Panthers', 'Jacksonville State Gamecocks',
  'Kennesaw State Owls', 'Liberty Flames', 'Louisiana Tech Bulldogs',
  'Middle Tennessee Blue Raiders', 'New Mexico State Aggies', 'Sam Houston Bearkats',
  'UTEP Miners', 'Western Kentucky Hilltoppers',
  // MAC
  'Akron Zips', 'Ball State Cardinals', 'Bowling Green Falcons', 'Buffalo Bulls',
  'Central Michigan Chippewas', 'Eastern Michigan Eagles', 'Kent State Golden Flashes',
  'Miami RedHawks', 'Miami (OH) RedHawks', 'Northern Illinois Huskies',
  'Ohio Bobcats', 'Toledo Rockets', 'Western Michigan Broncos',
  // Mountain West
  'Air Force Falcons', 'Boise State Broncos', 'Colorado State Rams',
  'Fresno State Bulldogs', 'Hawaii Rainbow Warriors', 'Nevada Wolf Pack',
  'New Mexico Lobos', 'San Diego State Aztecs', 'San Jose State Spartans',
  'UNLV Rebels', 'Utah State Aggies', 'Wyoming Cowboys',
  // Independents
  'Notre Dame Fighting Irish', 'Connecticut Huskies', 'UConn Huskies',
];

// Build a lowercase set for fast O(1) exact-match lookup
const FBS_LOWER = FBS_NAMES.map(n => n.toLowerCase());
const FBS_SET = new Set(FBS_LOWER);

/**
 * Returns true if the given team name (from The Odds API) matches a known FBS
 * program. Matching is case-insensitive and bidirectional: the API name may be
 * a shorter variant (e.g. "Alabama") or longer (e.g. "Alabama Crimson Tide").
 */
function isFBSTeam(teamName) {
  const lower = teamName.toLowerCase().trim();
  if (FBS_SET.has(lower)) return true;
  // Bidirectional partial match handles "Alabama" ↔ "Alabama Crimson Tide"
  return FBS_LOWER.some(id => lower.includes(id) || id.includes(lower));
}

module.exports = { isFBSTeam };
