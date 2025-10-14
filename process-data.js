import Graph from 'graphology';
import { parseStringPromise } from 'xml2js';
import { parse } from "csv-parse/sync";
import fs from "fs";

// Camelot wheel, used for converting between numeric and key tonalities.
const WHEEL = [ "D-Flat Minor", "A-Flat Minor", "E-Flat Minor", "B-Flat Minor",
                "F minor", "C Minor", "G Minor", "D Minor", "A Minor", "E Minor",
                "B Minor", "F-Sharp Minor", "E Major", "B Major", "F-Sharp Major",
                "D-Sharp Major", "A-Flat Major", "E-Flat Major", "B-Flat Major",
                "F Major", "C Major", "G Major", "D Major", "A Major" ];

// Sets of tag types, for parsing which tag belongs to which field.
const GENRES = new Set(["Techno", "House", "Hip Hop", "Latin", "Daria", 
                        "Breaks", "Dubstep", "Pop", "RnB", "IDM", "Death Drive" ]);
const VIBES = new Set(["Industrial", "Gritty", "Clean", "Brat", "Uplifting",
                       "Trippy", "Party", "Groovy", "Goofy" ]);
const INTENSITIES = new Set(["Mellow", "Medium", "Banger"]);

// Mapping from genres to colors for nodes:
// https://colorkit.co/palette/ff595e-ff924c-ffca3a-c5ca30-52a
// 675-1982c4-4267ac-6a4c93-d677b8-575757/
const COLORS = { "Techno": "#4267ac", "House": "#ffca3a", "Hip Hop": "#ff924c",
                 "Latin": "#ff595e", "Daria": "#d677b8", "Breaks": "#575757",
                 "Dubstep": "#6a4c93", "Pop": "#52a675", "RnB": "#c5ca30",
                 "IDM": "#1982c4", "Death Drive": "#222222" };

// Set up graph with appropriate settings
const graph = new Graph(
  { multi: false, allowSelfLoops: true, type: "directed" }
);

// Open up the collections.xml file and parse it into an object.
const xmlString = fs.readFileSync("./data/collection.xml", "utf8");
const result = await parseStringPromise(xmlString);
// List of songs
const library = result.DJ_PLAYLISTS.COLLECTION[0].TRACK;
// List of playlists, unprocessed
const rawPlaylists = result.DJ_PLAYLISTS.PLAYLISTS[0].NODE[0].NODE;

// Read the raw playlists into an object of sets
// Stores them as their trackIDs
// Later when iterating through tracks we can quickly check its playlists
const playlists = Object.fromEntries(rawPlaylists.map(
  rp => [rp['$'].Name, new Set(rp.TRACK.map(i => i['$'].Key))]
));

// Read out the history files and parse them like csvs (but with tabs)
const historyFiles = fs.readdirSync("./data/histories/")
const rawHistories = historyFiles.map(file => {
  return parse(fs.readFileSync("./data/histories/" + file), 
        { columns: true, delimiter: "\t" });
});

// Helper functions for parsing through song library

// Convert a camelot number (eg. 11A) to equivalent key
function camelotToKey(numStr) {
  let number = numStr.match(/\d+/g); // Extracts num using regex
  number = parseInt(number[0]) % 12 + (numStr[numStr.length - 1] == "A" ? 0 : 12);
  return WHEEL[number];
}

// From a songs # of plays, calculate its node size
function processSize(plays) {
  return plays / 10.0 + 2
}

// Process tags into their subcategories and clean up the strings
function parseTags(comment) {
  // Split and clean up tags
  const raw = comment.split("/");
  const tags = raw.map(tag => tag.replace(/\*/g, '').trim()).filter(i => i != '');
  return { "Genre": tags.filter(i => GENRES.has(i)), 
           "Vibe": tags.filter(i => VIBES.has(i)),
           "Intensity": tags.filter(i => INTENSITIES.has(i)) };
}

// From a song's trackID, returns a list of playlists it's in.
function getPlaylists(trackID) {
  return Object.keys(playlists).filter(key => playlists[key].has(trackID))
}

// From the name of a history file, get the ID of that session
function getSessionID(filename) {
  return filename.replace("HISTORY ", '').replace(".txt", '')
    .replace(" (", '-').replace(")", '')
}

// Calculates the distance between two camelot numbers
function getKeyDistance(key1, key2) {
  const [n1, n2] = [key1.match(/\d+/g), key2.match(/\d+/g)]
  return Math.abs(n2 - n1) + (key1[key1.length - 1] == key2[key2.length - 1] ? 0 : 1)
}

// Parse through each track and add it as a node to the graph.
for (const track of library) {
  const song = track.$;
  const tags = parseTags(song.Comments);
  // Object containing information from Rekordbox about the song
  const data = { "Artist": song.Artist, "BPM": song.AverageBpm, 
                 "Key": camelotToKey(song.Tonality), "Genre": tags.Genre,
                 "Vibe": tags.Vibe, "Intensity": tags.Intensity, 
                 "Playlists": getPlaylists(song.TrackID), "Play Count": song.PlayCount, 
                 "Date Added": song.DataAdded };
  // Object containing information about the node representation
  // Using sigma.js conventions.
  const attributes = { "color": COLORS[tags.Genre[0]], "label": song.Name, 
                       "size": processSize(song.PlayCount), "data" : data};
  graph.addNode(song.Name, attributes);
}

// Parse through the histories and add them as edges.
for (var i = 0; i < rawHistories.length; i++) {
  const hist = rawHistories[i]
  for (var j = 0; j < hist.length - 1; j++) {
    graph.updateEdge(
      hist[j]['Track Title'], hist[j+1]['Track Title'], attr => {
        return Object.keys(attr).length == 0 ?
          { "Weight": 1, "Sessions": [getSessionID(historyFiles[i])],
            "Key Change": getKeyDistance(hist[j].Key, hist[j+1].Key),
            "BPM Change": parseFloat(hist[j+1].BPM) - parseFloat(hist[j].BPM),
          } : { ...attr, "Weight": attr.Weight+ 1,
            "Sessions": [...attr.Sessions, getSessionID(historyFiles[i])]
          }
})}}

// Export graph to JSON file.
fs.writeFileSync("./public/graph.json", JSON.stringify(graph.export(), null, 2), "utf8");
