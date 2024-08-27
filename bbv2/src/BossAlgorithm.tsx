import * as sm from './StatManagement';
import us from './assets/sound/sfx/US.wav';

import { Randomizer, selected_attack } from './PlayerActions';
import {
    KnightStatusContext,
    DmageStatusContext, AssassinStatusContext,
    RmageStatusContext
} from './Context';
import { useState, useEffect, useContext } from 'react';
import * as sfx from './sfxManagement';
import { min_max_vals_map } from './StatManagement';
import {
    BossAttackingContext,
    KnightNameContext,
    DmageNameContext,
    AssassinNameContext,
    RmageNameContext
} from './Context';
//adds a multiplier or divider, depending
import { selected_difficulty } from './StartMenu';
import anime from 'animejs/lib/anime.es.js'
import { MatchToHpMap } from './hpmpmaps';




//This is going to work exactly the same as the player side, 
//except it's automated

/*how this is going to be weighted:
Target is somewhat random, but allies with 
a: status effects or
b: low hp 
are more likely to be targeted
Obviously he will check if a character is dead or not(if their hp is 0)

*/

let current_boss_attack: string;

interface BossAttackProps {
    phase: number;
    knight_status: string[];
    dmage_status: string[];
    assassin_status: string[];
    rmage_status: string[];
    current_turn: number;
}
let potential_targets: string[] = [];
let boss_atk_message: string = "";
let current_char: string;
export const NameToIndex: Map<string, number> = new Map(
    [
        ["knight", 0],
        ["dmage", 1],
        ["assassin", 2],
        ["rmage", 3]

    ]
)
interface CharacterRespectiveStats {
    [index: string]: number | undefined //allows usage of string as index
    hp: number;
    mp?: number;
    pdef: number;
    mdef: number;
    ev: number;
}

export let MatchToStat: Map<string, CharacterRespectiveStats> = new Map(
    [
        [
            "knight", {
                hp: sm.knight_stats.get("hp")!,
                mp: sm.knight_stats.get("mp")!,
                pdef: sm.knight_stats.get("p_def")!,
                mdef: sm.knight_stats.get("m_def")!,
                ev: sm.knight_stats.get("ev")!
            }
        ],
        [
            "dmage", {
                hp: sm.dmage_stats.get("hp")!,
                mp: sm.dmage_stats.get("mp")!,
                pdef: sm.dmage_stats.get("p_def")!,
                mdef: sm.dmage_stats.get("m_def")!,
                ev: sm.dmage_stats.get("ev")!
            }
        ],
        [
            "assassin", {
                hp: sm.assassin_stats.get("hp")!,
                mp: sm.assassin_stats.get("mp")!,
                pdef: sm.assassin_stats.get("p_def")!,
                mdef: sm.assassin_stats.get("m_def")!,
                ev: sm.assassin_stats.get("ev")!
            }
        ],
        [
            "rmage", {
                hp: sm.rmage_stats.get("hp")!,
                mp: sm.rmage_stats.get("mp")!,
                pdef: sm.rmage_stats.get("p_def")!,
                mdef: sm.rmage_stats.get("m_def")!,
                ev: sm.rmage_stats.get("ev")!
            }
        ]
    ]
)
//use this to ensure a gap between unholy symphonys
//If the list count gets to 10, he uses it then it resets
//Also use this for My Turn
export let last_boss_attacks: string[] = []

//Gradually revert any boss stats that were lowered or increased
function CheckForStatChange() {
    const boss_stats_to_check = ["p_def", "m_def", "atk"];

    for (let stat_name of boss_stats_to_check) {
        //first check if it's higher or lower than the default
        if (sm.boss_stats.get(stat_name)! > sm.boss_stats.get(`d_${stat_name}`)!) {
            sm.boss_stats.set(stat_name, sm.boss_stats.get(stat_name)! + 0.25)
        } else if (sm.boss_stats.get(stat_name)! < sm.boss_stats.get(`d_${stat_name}`)!) {
            sm.boss_stats.set(stat_name, sm.boss_stats.get(stat_name)! - 0.25)
        }
        //then make sure it doesn't exceed limits
        if (sm.boss_stats.get(stat_name)! > (sm.min_max_vals_map.get("boss") as any)[stat_name].max) {
            sm.boss_stats.set(stat_name, (sm.min_max_vals_map.get("boss") as any)[stat_name].max);
        }
        //ensure it's not below the min
        else if (sm.boss_stats.get(stat_name)! < (sm.min_max_vals_map.get("boss") as any)[stat_name].min) {
            sm.boss_stats.set(stat_name, (sm.min_max_vals_map.get("boss") as any)[stat_name].min);
        }
    }
}

export function Percentage() {
    return Math.random();
}
//use this for things like devourment
//Also have Unholy Synphony be the sum of the 
//last 10 attacks(divided by 2 maybe). Use a tritone for that sfx!
export let prev_dmg: number[] = [];

const allies = ["knight", "dmage", "assassin", "rmage"];
let chosen_target: string;
//failsafe
function CalculateStarterTarget() {
    return allies[(Math.random() * allies.length)];

}
export function bossAttackAlgo(attackProps: BossAttackProps) {

    chosen_target = CalculateStarterTarget();
    CheckForStatChange()
    let final_targets: number[] = []
    potential_targets = [];




    //first rule out any dead characters as potential targets
    let current_statuses = [
        attackProps.knight_status,
        attackProps.dmage_status,
        attackProps.assassin_status,
        attackProps.rmage_status
    ];

    let current_hp = [
        sm.knight_stats.get("hp")!,
        sm.dmage_stats.get("hp")!,
        sm.assassin_stats.get("hp")!,
        sm.rmage_stats.get("hp")!
    ]



    current_statuses.forEach((condition, index) => {
        if (!condition.includes("dead")) {
            potential_targets.push(allies[index]);

        }
    })


    /*
    Give each a number (start at 1 and go up accordingly) then 
    it’ll go in a chain to determine who he attacks, 
    starting with the highest number(s). 
    Eg, if a character ends up at 8, he has an 80% chance to target 
    that character. If he doesn’t, it moves to the next and sets 
    that as the target. Do this multiple times depending on how 
    many targets the attack has. To get around Inversion having 
    special requirements, remove it from the moveset first if 
    the conditions are not met 
     */

    let knight_weight: number = 1;
    let dmage_weight: number = 1;
    let assassin_weight: number = 1;
    let rmage_weight: number = 1;

    let character_weights: number[] = [
        knight_weight,
        dmage_weight,
        assassin_weight,
        rmage_weight
    ];
    let filtered_weights: number[] = [];
    //Breakpoint and the weight associated with it
    const CharacterWeightsMap: Map<number, number> = new Map(
        [
            [350, 1],
            [300, 2],
            [250, 3],
            [200, 4],
            [150, 5],
            [100, 6],
            [50, 7]
        ]
    )

    //determines how likely each character is to be targeted
    function DetermineWeights() {
        type BossAttackProps = {
            knight_status: string;
            dmage_status: string;
            assassin_status: string;
            rmage_status: string;

        };
        current_statuses.forEach((condition, index) => {

            //if they are dead, remove them from the array

            //resets to 0
            let character_weights: number[] = [knight_weight, dmage_weight, assassin_weight, rmage_weight];
            let characters = ['knight', 'dmage', 'assassin', 'rmage'];
            filtered_weights = [];

            for (let i = 0; i < characters.length; i++) {
                if (!(attackProps as any)[characters[i] + '_status'].includes("dead")) {
                    filtered_weights.push(character_weights[i]);
                }
            }



            if (condition.includes("poison")) {
                filtered_weights[index] += 2;
            }
            if (condition.includes("freeze")) {
                filtered_weights[index] += 3;
            }
            if (condition.includes("curse")) {
                filtered_weights[index] += 4;
            }
        })
        current_hp.forEach((hp, index) => {
            CharacterWeightsMap.forEach((weight, breakpoint) => {
                if (hp <= breakpoint) {

                    //ensures that only alive character's weights are taken into account (dead ones produce a NaN)
                    if (typeof filtered_weights[index] + weight === 'number') {
                        filtered_weights[index] += weight

                    }


                }
            }
            )
        })
    }

    //Target first, then the attack 

    //use a randomizer and set the max to the sum of all the weights

    /*GALAXY BRAIN TIME*/
    function Targeting() 
    {
        //Get max range for the randomizer
        const total_weights = filtered_weights.reduce((a, b) => a + b, 0);
        //Get a random value between 1 and the total weights
        const random_value = Randomizer(1, total_weights);

        //Sort the weights in descending order 
        //and calculate cumulative weights
        const weights_with_cumulative = filtered_weights
            //Map to an original array of objects 
            .map((weight, index) => (
                {
                    weight,
                    index
                }
            )
            )
            //Sort those objects high to low
            .sort((a, b) => b.weight - a.weight)
            //Map until the cumulative weight is calculated
            //item, index, and the array itself
            .map((item, index, arr) => (
                {
                    ...item,//represents each object
                    //add the cumulative weight of all characters 
                    //to each object. This is what the boss picks from.
                    //Do this for each array item until it reaches the end
                    cumulative_weight: arr.slice(0, index + 1).reduce(
                        (total, current) => total + current.weight, 0),
                }
            ));
        //*brain explosion sound effects*//
        for (let weight of weights_with_cumulative) 
        {
            //Compare the value from above to the cumulative weight 
            //The higher the individual weight, the higher the chance
            //it has to hit

            if (random_value <= weight.cumulative_weight && weight !== undefined) 
            {
                if (potential_targets[weight.index] !== undefined)
                {
                    chosen_target = potential_targets[weight.index];
                }
                break;
            }
        }
    }
    //use event listeners to determine when certain attacks are eligible
    //Then determine current moveset and weights for each move...
    DetermineWeights();
    Targeting();
    //He will only use this if everyone's mp is lower than their hp
    //MP must be <= 25% of max hp
    let inversion_eligible: boolean = false;
    /*
    First check conditionals for special attacks. 
    If any are met, set the moveset probabilities accordingly so 
    it still matches 100%. Inversion should have a quite high chance 
    of occurring if the condition is met. 
    After that, just do it based on a simple range. 
    Ie the range it falls into determines his attack  
    */
    function CheckForInversion() {

        //first 
        //the attack itself already does checks for dead, so this is fine
        if (sm.knight_stats.get("hp")! < sm.knight_stats.get("mp")! &&
            sm.dmage_stats.get("hp")! < sm.dmage_stats.get("mp")! &&
            sm.assassin_stats.get("hp")! < sm.assassin_stats.get("mp")! &&
            sm.rmage_stats.get("hp")! < sm.rmage_stats.get("mp")!) {
            inversion_eligible = true;
        } else {
            inversion_eligible = false;
        }

    }
    //Determines damage and image to show


    let moveset: Map<string, number>;
    let chosen_attack_num: number;

    let secondary_targets: string[] = [];
    let potential_secondary: string[];





    interface CalculateFinalProps {
        pre_dmg: number;
        target: string;
        atk_type: string;

    }
    function DeductHP(target: string, final_dmg: number) {
        setTimeout(() => {
            switch (target) {
                case "knight":
                    sm.knight_stats.set("hp", sm.knight_stats.get("hp")! - final_dmg);
                    MatchToHpMap.set("knight", sm.knight_stats.get("hp")!);
                    break;
                case "dmage":
                    sm.dmage_stats.set("hp", sm.dmage_stats.get("hp")! - final_dmg);
                    MatchToHpMap.set("dmage", sm.dmage_stats.get("hp")!);
                    break;
                case "assassin":
                    sm.assassin_stats.set("hp", sm.assassin_stats.get("hp")! - final_dmg);
                    MatchToHpMap.set("assassin", sm.assassin_stats.get("hp")!);
                    break;
                case "rmage":
                    sm.rmage_stats.set("hp", sm.rmage_stats.get("hp")! - final_dmg);
                    MatchToHpMap.set("rmage", sm.rmage_stats.get("hp")!);
                    break;
            }


        }, 3000)

    }
    //Match the target to their respective stats and get the final output
    function CalculateFinal(props: CalculateFinalProps): number {
        const attack_modifier = sm.boss_stat_changes.get(selected_difficulty)
        console.log("modifier", attack_modifier)

        let final_dmg: number = 0;
        //First check for evasion. undefined means they're dead
        if (props.target !== undefined &&
            MatchToStat.get(props.target)!.ev <= Percentage()) {
            //then add defense
            if (props.atk_type === "phys") {
                final_dmg = (props.pre_dmg / MatchToStat.get(props.target)!.pdef) * attack_modifier!.atk;

            } else if (props.atk_type === "mag") {
                final_dmg = (props.pre_dmg / MatchToStat.get(props.target)!.mdef) * attack_modifier!.atk;
            } else {
                final_dmg = props.pre_dmg * attack_modifier!.atk; //for stuff like US

            }
            prev_dmg.push(final_dmg)

            return final_dmg;

        } else {
            if (props.target !== undefined) {

                //used to determine the message
                boss_atk_message = 'evaded'
                current_char = props.target;
            }
        }
        return 0;
    }

    interface BossRNGProps {
        current_boss_attack: string;
        min: number; //because of inversion
        variance: number;
        atk_sfx?: string;
        secondary_targets?: string[];
        //if an attack hits multiple targets, 
        //the others are calculated in that function from the 
        //remaining pool (at random) and passed here
        attack_type: string; //mag, phys or none
    }
    //attacks like inversion thast have unique damage methods 
    //take place in the function itself
    function BossRNG(props: BossRNGProps) {
        current_boss_attack = props.current_boss_attack;

        const atk_max = props.min! * props.variance!;
        //remember to accoount for pdef/mdef/ev
        last_boss_attacks.push(current_boss_attack);

        //also sets the message to be displayed
        boss_atk_message = props.current_boss_attack;

        //Before def/ev is taken into account
        let pre_dmg = Randomizer(props.min!, atk_max);

        if (props.secondary_targets) {
            props.secondary_targets.push(chosen_target)
            props.secondary_targets.forEach((target) => {

                //add def/ev/mdef to the equation
                let x = CalculateFinal(
                    {
                        pre_dmg: pre_dmg,
                        target: target,
                        atk_type: props.attack_type
                    }
                )
                DeductHP(target, x);

            }
            )
        } else {
            DeductHP(chosen_target, CalculateFinal({
                pre_dmg: pre_dmg,
                target: chosen_target,
                atk_type: props.attack_type

            }))

        }

    }

    //DO NOT TOUCH
    function TargetMulti(additional_targets: number) {
        potential_secondary = [];

        potential_secondary = potential_targets.filter(
            (target) => target !== chosen_target);

        while (secondary_targets.length < additional_targets) {

            let rand = Randomizer(0, additional_targets + 1);

            if (!secondary_targets.includes(potential_secondary[rand])) {
                secondary_targets.push(potential_secondary[rand]);
            }
        }

        return secondary_targets;

    }
    //target is already chosen
    function LowerAllyStat(stat: string, amount: number) {

        const character_stats = MatchToStat.get(chosen_target);

        if (character_stats && character_stats[stat] !== undefined) {
            const stat_with_deduction = character_stats[stat]! - amount;

            // Dynamically update the stat in the corresponding object
            const stats_object = (sm as any)[chosen_target + "_stats"];

            if (stats_object && typeof stats_object.set === "function") {
                stats_object.set(stat, stat_with_deduction);

            }

        }



    }


    const boss_attack_functions: Map<string, Function> = new Map(
        [
            [
                "Shadow Blade", function ShadowBlade() {

                    return (
                        BossRNG
                            (
                                {
                                    current_boss_attack: "Shadow Blade",
                                    min: 60,
                                    variance: 1.10,

                                    attack_type: "phys"
                                }
                            )

                    )

                }
            ],
            [   //Targets 3, starting with the previously chosen
                "Spheres of Madness", function SpheresOfMadness() {

                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Spheres of Madness",
                                min: 45,
                                variance: 1.10,
                                secondary_targets: TargetMulti(2),

                                attack_type: "mag"
                            }

                        )

                    )

                }
            ],
            [
                "Devourment", function Devourment() {
                    //also heals boss by 2* damage inflicted
                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Devourment",
                                min: 140,
                                variance: 1.10,

                                attack_type: "phys"
                            }
                        )

                    )

                }
            ],
            [ //drops target's phys def, 40% chance
                "Disintegration", function Disintegration() {
                    if (Percentage() <= 0.40) {
                        //chosen target should never be undefined 
                        //but it is sometimes...
                        if (MatchToStat.get(chosen_target)!.pdef >
                            min_max_vals_map.get("player")!.p_def.min) {
                            LowerAllyStat("pdef", 0.20);

                        }
                    }
                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Disintegration",
                                min: 90,
                                variance: 1.10,

                                attack_type: "phys"
                            }
                        )


                    )

                }
            ],
            [ //drops target's mag def
                "Soul Crusher", function SoulCrusher() {

                    if (Percentage() <= 0.40) {
                        if (MatchToStat.get(chosen_target)!.mdef >
                            min_max_vals_map.get("player")!.m_def.min) {
                            LowerAllyStat("mdef", 0.20);
                            //use the maps for controlling stats
                            //Then restore them a little each boss turn
                            //until back to normal

                        }
                    }
                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Soul Crusher",
                                min: 90,
                                variance: 1.10,

                                attack_type: "mag"
                            }
                        )

                    )

                }
            ],
            [   //flips hp and mp of all characters
                //Only triggers if mp is lower than hp for all 
                "Inversion", function Inversion() {


                    const statsMap: { [key: string]: typeof sm.knight_stats } = {
                        knight: sm.knight_stats,
                        dmage: sm.dmage_stats,
                        assassin: sm.assassin_stats,
                        rmage: sm.rmage_stats,
                    };

                    for (let character of potential_targets) {
                        const stats = statsMap[character as keyof typeof statsMap];

                        const mp = stats.get("mp")!;
                        stats.set("hp", mp);

                    }

                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Inversion",
                                min: 0,
                                variance: 0,

                                secondary_targets: TargetMulti(3),
                                attack_type: "mag"
                            }
                        )
                    )
                }
            ],
            [
                "Frozen Soul", function FrozenSoul() {

                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Frozen Soul",
                                min: 45,
                                variance: 1.10,

                                attack_type: "mag"
                            }
                        )
                    )
                }
            ],
            [
                "Unending Grudge", function UnendingGrudge() {
                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Unending Grudge",
                                min: 45,
                                variance: 1.10,

                                attack_type: "mag"
                            }
                        )
                    )

                }
            ],
            [
                "Unholy Symphony", function UnholySymphony() {
                    const ussfx = new Audio(us);
                    ussfx.play();
                    //min given to the RNG is the total 
                    //of the past 10 attacks 

                    const last_ten_vals = prev_dmg.slice(-10); //without this you'd be entering phase 3 with a massive list lol 
                    console.log("last ten vals", last_ten_vals)
                    const total = (last_ten_vals.reduce(
                        (accumulator, currentValue) =>
                            accumulator + currentValue) / 1.75);
                    console.log("total", total)
                    prev_dmg = []//reset

                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Unholy Symphony",
                                min: total,
                                variance: 1.05,
                                atk_sfx: "US",
                                attack_type: "none",
                                secondary_targets: TargetMulti(3)
                            }
                        )
                    )
                }
            ],
            [
                "Death's Touch", function DeathsTouch() {
                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Death's Touch",
                                min: 65, //but lower chance of inflicting status
                                variance: 1.10,

                                attack_type: "phys"

                            }
                        )
                    )

                }
            ],
            [
                "Chaos Blade", function ChaosBlade() {
                    return (
                        BossRNG(
                            {
                                current_boss_attack: "Chaos Blade",
                                min: 165,
                                variance: 1.10,

                                attack_type: "phys"
                            }
                        )
                    )

                }
            ]
        ]
    );
    function Attack() {
        chosen_num = GetRandomNumber(attacks_grab_bag);

        boss_attack_functions.get(attack_nums.get(chosen_num)!)!();
    }

    function GetRandomNumber(arr: number[]) {
        return (arr[Math.floor(Math.random() * arr.length)])
    }
    //How this will work is each stage gets an array with 
    //a certain amount of each number in it. 
    //The number pulled matches whatever attack he uses
    //which corresponds with a function
    let attacks_grab_bag: number[] = []
    let chosen_num: number = 0;
    switch (attackProps.phase) {
        case 1:
            attacks_grab_bag = [1, 1, 1, 2, 2, 3, 4, 5];
            chosen_num = GetRandomNumber(attacks_grab_bag);
            Attack()
            break;
        case 2:
            CheckForInversion();
            if (inversion_eligible) {
                //adjust the percentages accordingly
                attacks_grab_bag = [1, 1, 2, 3, 4, 5,
                    6, 6, 6, 6, 6, 7, 7, 8]

            } else {
                //use the default moveset, 
                //which has inversion at a 0% chance
                attacks_grab_bag = [1, 1, 2, 2, 3, 4, 5, 6, 7, 8]
            }
            Attack()
            break;
        case 3:

            CheckForInversion();
            if (last_boss_attacks.length >= 10) {
                boss_attack_functions.get("Unholy Symphony")!();
                last_boss_attacks = [];

            } else {
                if (inversion_eligible) {
                    //adjust the percentages accordingly
                    //9 is unholy symphony, doesn't go off by chance
                    attacks_grab_bag = [1, 1, 2, 3, 4, 5,
                        6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 8, 10, 11]

                } else {
                    //use the default moveset, 
                    //which has inversion at a 0% chance
                    attacks_grab_bag = [1, 2, 2, 3, 3, 4, 5, 7,
                        8, 10, 11, 11]
                }
                Attack()
            }
            break;
    }


    secondary_targets.push(chosen_target)

    //failsafes and convert to indexes 

    const filtered_secondary_targets = secondary_targets.filter(target => target !== undefined)

    filtered_secondary_targets.forEach(target => {
        final_targets.push(NameToIndex.get(target)!)

    })




    //if, for some GODFORSAKEN REASON, it's empty at this point, add in a random potential target
    if (final_targets.length === 0) {
        final_targets.push(NameToIndex.get(potential_targets[(Math.random() * potential_targets.length)])!)
    }
    final_targets = final_targets.filter(target => target !== undefined);


    return {
        last_boss_attacks,
        final_targets
    }
};//algo function ends here 


const attack_nums: Map<number, string> = new Map(
    [
        [1, "Shadow Blade"], //standard atk, med phys
        [2, "Spheres of Madness"], //low mag dmg, hits all allies
        [3, "Devourment"], //Heavy phys, heals boss by damage dealt
        [4, "Disintegration"], //med phys dmg, Med chance to lower phys def
        [5, "Soul Crusher"], //med mag dmg, med chance to lower mag def
        //phase 2
        [6, "Inversion"], //occurs whenever all allies have lower mp than 25% of their max hp
        [7, "Frozen Soul"], //med dmg, low freeze chance
        [8, "Unending Grudge"], //med dmg, low poison chance
        //phase 3
        [9, "Unholy Symphony"], //ultimate, Runs every 10 turns. 4 random targets (can double up), low chance to curse each
        [10, "Death's Touch"], //med dmg, low curse chance
        [11, "Chaos Blade"] //very heavy single target phys dmg
    ]
);

export function AttackAnimation() {
    anime({
        targets: ['.boss-attack', '.player-attack'],
        scale: 1.2,
        duration: 2000,
        opacity: 0.5,
        easing: 'linear'
    });
};
export const BossAttackArea: React.FC = () => {
    const [isBossAttackShown, setIsBossAttackShown] = useState(false);
    const { isBossAttacking, setIsBossAttacking } = useContext(BossAttackingContext)

    const { KnightName } = useContext(KnightNameContext);
    const { DmageName } = useContext(DmageNameContext);
    const { AssassinName } = useContext(AssassinNameContext);
    const { RmageName } = useContext(RmageNameContext);

    //match targeted character to the chosen name
    const CharToName: Map<string, string> = new Map(
        [
            ["knight", KnightName],
            ["dmage", DmageName],
            ["assassin", AssassinName],
            ["rmage", RmageName]
        ]
    )
    //Change the image whenver the attack changes
    useEffect(() => {
        setTimeout(() => { //should prevent issue with images not loading in time
            setIsBossAttackShown(true);
            setIsBossAttacking(true);

        }, 1000)

        setTimeout(() => {
            setIsBossAttackShown(false);
            setIsBossAttacking(false);

        }, 3000);
    }, [current_boss_attack]);



    useEffect(() => {
        if (isBossAttackShown) {
            AttackAnimation();
        }
    }, [isBossAttackShown]);





    //use name state here and customize the message accordingly 
    return (
        <section className='max-w-[32rem] absolute top-40 z-50  border-red-700'>

            {isBossAttackShown &&
                <>
                    <h1 className='text-7xl text-white'>
                        {boss_atk_message === 'evaded' ?
                            `${CharToName.get(current_char)} evaded` :
                            boss_atk_message}
                    </h1>
                    {
                        current_boss_attack !== undefined && //it ends up undefined if my turn negates it
                        <img className={
                            isBossAttackShown ?
                                'z-50 mt-72 mr-64 boss-attack rounded-xl' :
                                'z-50 mt-72 mr-64 rounded-xl'
                        }
                            src={
                                require(`./assets/images/boss/attacks/${current_boss_attack}.png`)}
                            loading='eager'>
                        </img>
                    }

                </>
            }
            <script src='anime.min.js'></script>
        </section>
    )
}

