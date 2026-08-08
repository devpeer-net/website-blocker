/**
 * Curated, fact-checked tips shown when the user tries to turn blocking off, and on the
 * block page. Pure — no `chrome` namespace.
 *
 * Every entry cites a real study whose DOI resolves to the claimed paper and whose text
 * does not overstate the finding. Twelve candidates were rejected during fact-checking,
 * including the "23 minutes to refocus" figure (a 2006 press interview, not a paper), the
 * phone "brain drain" effect (failed pre-registered replication) and the goldfish
 * attention span (no source at all). Do not add a tip without checking its citation.
 */

export type TipCategory = 'attention' | 'breaks' | 'doomscrolling' | 'movement' | 'sleep' | 'stress'

export interface Tip {
  readonly text: string
  readonly category: TipCategory
  /** Human-readable citation: authors, journal, year. */
  readonly source: string
  /** Resolvable DOI or journal URL for the cited study. */
  readonly url: string
}

export const TIPS = [
  {
    text: 'After the Boston bombings, people who watched six or more hours of coverage a day reported more acute stress than people who were there.',
    category: 'doomscrolling',
    source: 'Holman, Garfin & Silver, PNAS, 2014',
    url: 'https://doi.org/10.1073/pnas.1316265110',
  },
  {
    text: 'Distress makes us seek more distressing news, which deepens distress. A three-year study found the loop runs in both directions.',
    category: 'doomscrolling',
    source: 'Thompson, Jones, Holman & Silver, Science Advances, 2019',
    url: 'https://doi.org/10.1126/sciadv.aav3502',
  },
  {
    text: 'Across 17 countries, bodies reacted more strongly to negative news than to positive. That pull you feel is physiology, not weakness.',
    category: 'doomscrolling',
    source: 'Soroka, Fournier & Nir, PNAS, 2019',
    url: 'https://doi.org/10.1073/pnas.1908369116',
  },
  {
    text: 'The researchers who first measured doomscrolling found it travels together with anxiety, habitual media use, and low self-control.',
    category: 'doomscrolling',
    source: 'Sharma, Lee & Johnson, Technology, Mind, and Behavior, 2022',
    url: 'https://doi.org/10.1037/tmb0000059',
  },
  {
    text: 'Texted five times daily for two weeks, people felt worse after Facebook, not before it. The dip follows the scroll.',
    category: 'doomscrolling',
    source: 'Kross et al., PLOS ONE, 2013',
    url: 'https://doi.org/10.1371/journal.pone.0069841',
  },
  {
    text: 'In a Danish trial of 1,095 people, one week off Facebook raised life satisfaction and mood, most of all for heavy users.',
    category: 'doomscrolling',
    source: 'Tromholt, Cyberpsychology, Behavior, and Social Networking, 2016',
    url: 'https://doi.org/10.1089/cyber.2016.0259',
  },
  {
    text: 'Students who capped each social app at ten minutes a day felt significantly less lonely and less depressed after three weeks.',
    category: 'doomscrolling',
    source: 'Hunt, Marx, Lipson & Young, Journal of Social and Clinical Psychology, 2018',
    url: 'https://doi.org/10.1521/jscp.2018.37.10.751',
  },
  {
    text: 'In a randomized trial with 2,743 people, four weeks off Facebook produced a small but measurable rise in wellbeing, and the freed time went to family, friends and offline life.',
    category: 'doomscrolling',
    source: 'Allcott, Braghieri, Eichmeyer & Gentzkow, American Economic Review, 2020',
    url: 'https://doi.org/10.1257/aer.20190658',
  },
  {
    text: 'Analyzing over a million posts from 4,000 people, researchers found that when we post is shaped by the same reward-learning rules that govern how animals chase rewards.',
    category: 'attention',
    source: 'Lindstr\u00f6m et al., Nature Communications, 2021',
    url: 'https://doi.org/10.1038/s41467-020-19607-x',
  },
  {
    text: 'The quick check is a learned habit: brief inspections get rewarded with novelty, and repetition makes them automatic. Habits can be relearned.',
    category: 'attention',
    source: 'Oulasvirta, Rattenbury, Ma & Raita, Personal and Ubiquitous Computing, 2012',
    url: 'https://doi.org/10.1007/s00779-011-0412-2',
  },
  {
    text: "Across 23 studies, problematic phone use travels with anxiety and low mood. It's a very common pattern, not a personal failing.",
    category: 'attention',
    source: 'Elhai, Dvorak, Levine & Hall, Journal of Affective Disorders, 2017',
    url: 'https://doi.org/10.1016/j.jad.2016.08.030',
  },
  {
    text: "Switching your phone to grayscale for a week cut daily screen time by about twenty minutes and increased people's sense of control over their use.",
    category: 'attention',
    source: 'Dekker & Baumgartner, Mobile Media & Communication, 2024',
    url: 'https://doi.org/10.1177/20501579231212062',
  },
  {
    text: 'People whose notifications arrived in three daily batches felt more attentive and less stressed. Hourly batching did nothing, and switching alerts off entirely backfired.',
    category: 'attention',
    source:
      'Fitz, Kushlev, Jagannathan, Lewis, Paliwal & Ariely, Computers in Human Behavior, 2019',
    url: 'https://doi.org/10.1016/j.chb.2019.07.016',
  },
  {
    text: 'For one week people kept their alerts on; for another, off. The same people reported more inattention and restlessness during the alerts-on week.',
    category: 'attention',
    source: 'Kushlev, Proulx & Dunn, CHI 2016 Proceedings',
    url: 'https://doi.org/10.1145/2858036.2858359',
  },
  {
    text: "Part of your attention stays behind on the last task. Finishing what you're on before you switch makes the switch much cheaper.",
    category: 'attention',
    source: 'Leroy, Organizational Behavior and Human Decision Processes, 2009',
    url: 'https://doi.org/10.1016/j.obhdp.2009.04.002',
  },
  {
    text: 'Lab studies show every task switch costs measurable time to reload the rules. The tax is small each time, and constant.',
    category: 'attention',
    source:
      'Rubinstein, Meyer & Evans, Journal of Experimental Psychology: Human Perception and Performance, 2001',
    url: 'https://doi.org/10.1037/0096-1523.27.4.763',
  },
  {
    text: 'Interrupted workers finished just as fast, by working harder. The cost showed up as higher stress, frustration and time pressure.',
    category: 'attention',
    source: 'Mark, Gudith & Klocke, CHI 2008 Proceedings',
    url: 'https://doi.org/10.1145/1357054.1357072',
  },
  {
    text: "We spend about 47% of waking hours thinking about something other than what we're doing, and it usually feels worse.",
    category: 'attention',
    source: 'Killingsworth & Gilbert, Science, 2010',
    url: 'https://doi.org/10.1126/science.1192439',
  },
  {
    text: 'A walk in a park improved attention scores; a comparable walk downtown did not. Nature seems to restore attention rather than spend it.',
    category: 'attention',
    source: 'Berman, Jonides & Kaplan, Psychological Science, 2008',
    url: 'https://doi.org/10.1111/j.1467-9280.2008.02225.x',
  },
  {
    text: 'Pooling 22 samples, a meta-analysis found short breaks of ten minutes or less give a small but reliable lift to energy and drop in fatigue.',
    category: 'breaks',
    source: 'Albulescu et al., PLOS ONE, 2022',
    url: 'https://doi.org/10.1371/journal.pone.0272460',
  },
  {
    text: "Recovery depends on mentally stepping away, not just physically. A break you spend still chewing on work doesn't refill much.",
    category: 'breaks',
    source: 'Sonnentag & Fritz, Journal of Organizational Behavior, 2015',
    url: 'https://doi.org/10.1002/job.1924',
  },
  {
    text: 'Forty seconds looking at a green rooftop was enough to restore attention on a demanding task. A window may do.',
    category: 'breaks',
    source: 'Lee, Williams, Sargent, Williams & Johnson, Journal of Environmental Psychology, 2015',
    url: 'https://doi.org/10.1016/j.jenvp.2015.04.003',
  },
  {
    text: 'Tracking 95 workers across five days, the breaks that restored the most energy and focus were the ones taken earlier in the day, doing something the person actually liked.',
    category: 'breaks',
    source: 'Hunter & Wu, Journal of Applied Psychology, 2016',
    url: 'https://doi.org/10.1037/apl0000045',
  },
  {
    text: 'On days when employees took a fifteen-minute lunchtime walk in a park, they concentrated better and felt less tired that afternoon.',
    category: 'breaks',
    source:
      'Sianoja, Syrek, de Bloom, Korpela & Kinnunen, Journal of Occupational Health Psychology, 2018',
    url: 'https://doi.org/10.1037/ocp0000083',
  },
  {
    text: 'Across four experiments, walking beat sitting for generating new ideas, and the boost carried over after people sat back down.',
    category: 'movement',
    source:
      'Oppezzo & Schwartz, Journal of Experimental Psychology: Learning, Memory, and Cognition, 2014',
    url: 'https://doi.org/10.1037/a0036577',
  },
  {
    text: 'Ten minutes of easy stair-walking lifted energy more than 50mg of caffeine in a small trial of sleep-deprived young women.',
    category: 'movement',
    source: "Randolph & O'Connor, Physiology & Behavior, 2017",
    url: 'https://doi.org/10.1016/j.physbeh.2017.03.013',
  },
  {
    text: 'Pooling ten UK studies of green exercise, the largest self-esteem gains arrived in the first five minutes. Five minutes counts.',
    category: 'movement',
    source: 'Barton & Pretty, Environmental Science & Technology, 2010',
    url: 'https://doi.org/10.1021/es903183r',
  },
  {
    text: 'People spending at least two hours a week in nature were more likely to report good health and high wellbeing.',
    category: 'movement',
    source: 'White et al., Scientific Reports, 2019',
    url: 'https://doi.org/10.1038/s41598-019-44097-3',
  },
  {
    text: 'In a randomized week, checking email only three times a day measurably lowered daily stress. Fewer check-ins, not more willpower.',
    category: 'stress',
    source: 'Kushlev & Dunn, Computers in Human Behavior, 2015',
    url: 'https://doi.org/10.1016/j.chb.2014.11.005',
  },
  {
    text: 'Five minutes a day of cyclic sighing, a double inhale through the nose then a long exhale through the mouth, beat mindfulness meditation for lifting mood over a month.',
    category: 'stress',
    source: 'Balban et al., Cell Reports Medicine, 2023',
    url: 'https://doi.org/10.1016/j.xcrm.2022.100895',
  },
  {
    text: 'Naming a feeling, as in "this is restlessness", quiets the brain\'s alarm response. Try labeling the urge before deciding anything.',
    category: 'stress',
    source: 'Lieberman et al., Psychological Science, 2007',
    url: 'https://doi.org/10.1111/j.1467-9280.2007.01916.x',
  },
  {
    text: 'Commuters expected chatting with a stranger to be unpleasant. Those who did enjoyed the trip more. Connection beats our forecast.',
    category: 'stress',
    source: 'Epley & Schroeder, Journal of Experimental Psychology: General, 2014',
    url: 'https://doi.org/10.1037/a0037323',
  },
  {
    text: 'Students who forgave themselves for procrastinating on one exam procrastinated less before the next one.',
    category: 'stress',
    source: 'Wohl, Pychyl & Bennett, Personality and Individual Differences, 2010',
    url: 'https://doi.org/10.1016/j.paid.2010.01.029',
  },
  {
    text: 'Urges rise and fall like waves. Smokers taught to watch an urge rather than fight it smoked less over the following week.',
    category: 'stress',
    source: 'Bowen & Marlatt, Psychology of Addictive Behaviors, 2009',
    url: 'https://doi.org/10.1037/a0017127',
  },
  {
    text: 'Reading on a bright screen before bed delayed sleep, suppressed melatonin, and left people groggier next morning than print did.',
    category: 'sleep',
    source: 'Chang, Aeschbach, Duffy & Czeisler, PNAS, 2015',
    url: 'https://doi.org/10.1073/pnas.1418490112',
  },
  {
    text: "Researchers call it bedtime procrastination: going to bed later than you meant to, for no external reason. It's remarkably common.",
    category: 'sleep',
    source: 'Kroese, De Ridder, Evers & Adriaanse, Frontiers in Psychology, 2014',
    url: 'https://doi.org/10.3389/fpsyg.2014.00611',
  },
  {
    text: 'One sleepless night sharply raised next-day anxiety in a controlled study, and deep slow-wave sleep brought it back down.',
    category: 'sleep',
    source: 'Ben Simon, Rossi, Harvey & Walker, Nature Human Behaviour, 2020',
    url: 'https://doi.org/10.1038/s41562-019-0754-8',
  },
  {
    text: 'In a survey of 844 adults, phone use after lights out went with taking longer to fall asleep, worse sleep quality and more daytime tiredness. An association, not proof of cause.',
    category: 'sleep',
    source: 'Exelmans & Van den Bulck, Social Science & Medicine, 2016',
    url: 'https://doi.org/10.1016/j.socscimed.2015.11.037',
  },
] as const satisfies readonly Tip[]

/**
 * Pick a tip deterministically from a seed, so a given moment shows a stable tip and
 * tests can assert on it. Callers pass `Date.now()`.
 */
export function pickTip(seed: number): Tip {
  const index = Math.abs(Math.trunc(seed)) % TIPS.length
  return TIPS[index] as Tip
}
