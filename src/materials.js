'use strict';

/**
 * Exhaustive-enough gemstone / material catalog for UAT typeahead.
 * ~250 entries — small enough to ship in-memory and filter client-side.
 */
const MATERIALS = [
  // Diamonds & carbon
  'natural_diamond', 'lab_diamond', 'diamond', 'carbonado', 'lonsdaleite',
  // Corundum
  'ruby', 'sapphire', 'padparadscha', 'star_ruby', 'star_sapphire',
  // Beryl
  'emerald', 'aquamarine', 'morganite', 'heliodor', 'goshenite', 'red_beryl', 'bixbite',
  // Chrysoberyl
  'alexandrite', 'chrysoberyl', 'cats_eye_chrysoberyl',
  // Quartz family
  'amethyst', 'citrine', 'rose_quartz', 'smoky_quartz', 'rock_crystal', 'aventurine',
  'prasiolite', 'amethyst_citrine', 'tiger_eye', 'hawk_eye', 'bull_eye', 'jasper',
  'chalcedony', 'agate', 'carnelian', 'onyx', 'sardonyx', 'chrysoprase', 'bloodstone',
  'heliotrope', 'plasma', 'sard', 'flint', 'chert',
  // Garnet group
  'garnet', 'almandine', 'pyrope', 'spessartine', 'grossular', 'andradite', 'uvarovite',
  'tsavorite', 'demantoid', 'mali_garnet', 'rhodolite', 'hessonite', 'melanite', 'topazolite',
  // Tourmaline
  'tourmaline', 'rubellite', 'indicolite', 'paraiba_tourmaline', 'verdelite',
  'achroite', 'dravite', 'schorl', 'watermelon_tourmaline', 'chrome_tourmaline',
  // Topaz
  'topaz', 'imperial_topaz', 'blue_topaz', 'pink_topaz', 'yellow_topaz', 'white_topaz',
  // Spinel
  'spinel', 'red_spinel', 'blue_spinel', 'pink_spinel', 'black_spinel', 'cobalt_spinel',
  // Zircon & cubic
  'zircon', 'blue_zircon', 'hyacinth', 'cubic_zirconia',
  // Peridot / olivine
  'peridot', 'olivine', 'chrysolite',
  // Tanzanite / zoisite / epidote
  'tanzanite', 'zoisite', 'thulite', 'anyolite', 'epidote', 'unakite',
  // Feldspar
  'moonstone', 'labradorite', 'sunstone', 'amazonite', 'orthoclase', 'microcline',
  'albite', 'oligoclase', 'andesine', 'spectrolite', 'rainbow_moonstone',
  // Opal
  'opal', 'black_opal', 'white_opal', 'fire_opal', 'boulder_opal', 'crystal_opal',
  'water_opal', 'matrix_opal', 'ethiopian_opal', 'mexican_opal',
  // Jade
  'jade', 'jadeite', 'nephrite', 'imperial_jade',
  // Turquoise & related
  'turquoise', 'variscite', 'chrysocolla', 'larimar',
  // Lapis & lazurite
  'lapis_lazuli', 'lazurite', 'sodalite', 'hauyne',
  // Pearl & organic
  'pearl', 'akoya_pearl', 'south_sea_pearl', 'tahitian_pearl', 'freshwater_pearl',
  'keshi_pearl', 'mabe_pearl', 'conch_pearl', 'melo_pearl', 'abalone_pearl',
  'coral', 'amber', 'jet', 'ivory', 'mother_of_pearl', 'nacre', 'copal',
  // Fancy / rare
  'tanzanite', 'kunzite', 'hiddenite', 'spodumene', 'iolite', 'cordierite',
  'andalusite', 'chiastolite', 'kyanite', 'sillimanite', 'apatite', 'benitoite',
  'painite', 'taaffeite', 'musgravite', 'jeremejevite', 'grandidierite',
  'pezzottaite', 'serendibite', 'hibonite', 'poudretteite', 'jeremejevite',
  // Sphene / titanite / scapolite etc.
  'sphene', 'titanite', 'scapolite', 'diopside', 'chrome_diopside', 'enstatite',
  'hypersthene', 'broncite', 'augite', 'hedenbergite',
  // Corundum-adjacent / other oxides
  'rutile', 'brookite', 'anatase', 'cassiterite', 'hematite', 'magnetite',
  'pyrite', 'marcasite', 'goethite', 'limonite',
  // Sulfides / unusual
  'sphalerite', 'cinnabar', 'realgar', 'orpiment',
  // Carbonates
  'malachite', 'azurite', 'rhodochrosite', 'smithsonite', 'aragonite', 'calcite',
  'magnesite', 'siderite', 'cerussite', 'witherite',
  // Phosphates
  'apatite', 'turquoise', 'variscite', 'amblygonite', 'brazilianite', 'lazulite',
  'wardite', 'childrenite',
  // Sulfates
  'gypsum', 'selenite', 'alabaster', 'anhydrite', 'celestine', 'barite',
  // Fluorite / halides
  'fluorite', 'halite', 'cryolite',
  // Silicates misc
  'prehnite', 'apophyllite', 'datolite', 'danburite', 'axinite', 'vesuvianite',
  'idocrase', 'californite', 'serpentine', 'bowenite', 'williamsite', 'chrysotile',
  'talc', 'steatite', 'pyrophyllite', 'chlorite',
  // Zeolites
  'stilbite', 'heulandite', 'natrolite', 'analcime', 'thomsonite',
  // Obsidian & volcanic glass
  'obsidian', 'snowflake_obsidian', 'mahogany_obsidian', 'rainbow_obsidian',
  'apache_tear', 'moldavite', 'tektite', 'libyan_desert_glass',
  // Synthetic / simulant / commercial
  'moissanite', 'synthetic_ruby', 'synthetic_sapphire', 'synthetic_emerald',
  'synthetic_alexandrite', 'glass', 'paste', 'strass', 'yttrium_aluminum_garnet',
  'gadolinium_gallium_garnet', 'lithium_niobate',
  // Beads / findings / scrap / ops
  'bead', 'strand', 'finding', 'component', 'scrap', 'scrap_metal', 'gold_scrap',
  'silver_scrap', 'platinum_scrap', 'mixed_parcel', 'unknown',
  // Additional colored stones commonly traded
  'blue_sapphire', 'yellow_sapphire', 'pink_sapphire', 'white_sapphire',
  'green_sapphire', 'purple_sapphire', 'orange_sapphire', 'parti_sapphire',
  'fancy_sapphire', 'kanchanaburi_sapphire', 'ceylon_sapphire', 'kashmir_sapphire',
  'burmese_ruby', 'mozambican_ruby', 'thai_ruby',
  'colombian_emerald', 'zambian_emerald', 'brazilian_emerald',
  'paraiba', 'cuprian_tourmaline', 'chrome_tourmaline',
  'mandarin_garnet', 'malaia_garnet', 'color_change_garnet', 'color_change_sapphire',
  'color_change_spinel', 'color_change_diaspore', 'zultanite', 'csarite',
  'hackmanite', 'charoite', 'sugilite', 'howlite', 'magnesite', 'dolomite',
  'rhodonite', 'thulite', 'eudialyte', 'larvikite', 'nuummite', 'pietersite',
  'tigers_eye', 'hawks_eye', 'cats_eye', 'silk_sapphire',
  'black_diamond', 'champagne_diamond', 'cognac_diamond', 'yellow_diamond',
  'pink_diamond', 'blue_diamond', 'green_diamond', 'red_diamond', 'argyle_diamond',
  'salt_and_pepper_diamond', 'rough_diamond', 'melee_diamond', 'calibrated_sapphire',
  'calibrated_ruby', 'calibrated_emerald',
].filter((v, i, a) => a.indexOf(v) === i).sort();

const VENDORS = [
  'RUCHI DIAMONDS',
  'DHARM INTERNATIONAL',
  'DALUMI DIAMOND CORP',
  'KASPHUL LLC',
  'PALA INTERNATIONAL',
  'CHINASTONE LLC',
  'TSAVORITE FACTORY',
];

module.exports = { MATERIALS, VENDORS };
