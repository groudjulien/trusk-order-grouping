/**
 * @Auteur : Julien Groud
 * @Date_creation : 14/07/2017
 * @Version : 0.0.5
 * @Entreprise : Trusk
 * @Description : Script qui calcul les prochaines courses d'un trusker dans les 4 prochaines heures
 * @Durée : ~4/5H : 
 *	- compréhension du sujet
 *	- compréhension du code source
 *	- rédaction des différentes étapes du script
 *	- rédaction des questions pour une meilleure compréhension du sujet
 *	- développement du script
 *	- test
 *
 * Détails du script :
 *	- étape 1 : ne garde que les courses qui commencent dans les 4 prochaines heures (moins de courses => calculs plus rapide)
 *	- étape 2 : groupe les courses qui peuvent l'être (pour calculer le programme du trusker)
 *	- étape 3 : calcule le planning du trusker pour les 4 prochaines heures
 *
 * Spécifications : 
 *	- Pour le choix des courses : je calcul à chaque fois la meilleur course qui suit la précédente. La meilleur course étant la moins loin et avec le moins d'attente
 *
 *	Améliorations : 
 * 	- Lors du groupage des courses : ne pas grouper avec la première qui remplit les conditions mais avec la meilleur des courses qui remplit les conditions
 *	- Grouper plus de 2 courses
 *	- Mettre un meilleur algorithme (prenant en compte le prix?) pour choisir la liste des courses du trusker
 */

const orders = require('./orders');
const moment = require('moment');
const geolib = require('geolib');

// Génération des courses sur 4H
const TIME_MAX_FOR_GROUPORDERS = (4*60*60*1000);
// Le prix min d'une course pour être groupé : 1€
const PRICE_MIN_ORDER_FOR_GROUP = 100;
// Le prix max d'une course pour être groupé : 29€
const PRICE_MAX_ORDER_FOR_GROUP = 2900;
// Distance maximum pour que deux courses soient groupé : 10km
const DISTANCE_MAX_GROUP = 10000;
// Temps maximum pour que deux courses soient groupé : 10 minutes
const TIME_MAX_GROUP = (10*60*1000);
// Facteur augmentant le poid du temps par rapport à la distance ( 10 km ~= 30 minutes )
const FACTOR_BETWEEN_TIME_AND_DISTANCE = 5.55;

/**
 * Fonction qui calcul les prochaines courses du trusker dans les 4 prochaines heures
 * @params {OBJECT} orders - la liste des commandes
 * @params {FLOAT} lat - la latitude de la position actuelle du trusker
 * @params {FLOAT} lng - la longitude de la position actuelle du trusker
 * @params {DATE} datetime - la date actuel
 * @return {OBJECT} le tableau contenant les prochaines courses du trusker
 */
const groupOrders = orders => (lat, lng, datetime) => {

	// Si il n'y a pas de données , les calcules sont inutiles (perte de temps et de puissance de calcul)
	if(
		typeof( orders ) === "undefined"
		|| typeof( orders["features"] ) === "undefined"
		|| orders["features"].length == 0
	){
		return [];
	}

	// Filtrage des courses qui commencent dans les 4 prochaines heures
	var array_order_filtrate_hours = getOrdersInTheNextHours( orders )( datetime, TIME_MAX_FOR_GROUPORDERS );

	// Si aucune course trouvé => on retourne un tableau vide
	if( array_order_filtrate_hours.length == 0 ){ return []; }

	// On regroupe les courses qui peuvent l'être
	var array_orders_with_groups = getOrdersWithGroup( array_order_filtrate_hours )( PRICE_MIN_ORDER_FOR_GROUP ,PRICE_MAX_ORDER_FOR_GROUP );
	
	// On cherche le meilleur ordonnancement pour le trusker
	var array_orders_for_trusker = getOrdersForTrusker( array_orders_with_groups )( lat, lng, datetime );

	return array_orders_for_trusker;
};

/**
 * Fonction qui sélectionne uniquement les courses qui commence entre une date de début et une date de fin 
 * @params {OBJECT} orders - la liste des courses disponible
 * @params {DATE} datetime - la date minimum de début de course 
 * @params {INT} time_max - nombre de millième de secondes entre la date de début et la date de fin
 * @return {OBJECT} array_order_filtrate_hours - un tableau contenant seulement les courses qui commencent entre les deux dates
 */
const getOrdersInTheNextHours = orders => ( datetime, time_max ) => {
	
	//transformation de la date actuelle en timestamp :
	datetime_ts = moment(datetime).format("x");
	
	var array_order_filtrate_hours = [];
	for( var i in orders["features"] ){

		// Si i=2 alors i+1 peut être égale à 21 (car traite des strings si il n'y a pas de parsing)
		i = parseInt(i);

		// Si on est bien sur l'information de date
		if( orders["features"][ i ]["properties"]["type"] == "start" ){

			// Calcul du timestamp de début de la course courante
			var start_date = moment( orders["features"][ i ]["properties"]["date"] ).format( "x" );

			// Si la course n'est pas déjà commencé et qu'elle commence dans moins de 4h
			if(
				start_date > datetime_ts
				&& start_date - datetime_ts < time_max
			){
				// On cherche la seconde partie de la course : les données d'arrivé
				if(
					orders["features"][ i ]["properties"]["name"] === orders["features"][ (i+1) ]["properties"]["name"]
					&& orders["features"][ (i+1) ]["properties"]["type"] === "end"
				){
					array_order_filtrate_hours.push( { "start":orders["features"][ i ] , "end":orders["features"][ i+1 ] } );
				} else {
					console.log("*ERR : l'information de fin de course n'est pas directement après l'information de début de course : TODO: créer une fonction de recherche pour retrouver l'information manquante");
					return [];
				}
			}
		}
	}

	return array_order_filtrate_hours;
}

/**
 * Fonction qui parcours la liste des courses et regroupe toutes celles qui peuvent l'être
 * @params {OBJECT} array_order_filtrate_hours - tableau des courses filtré sur une certaines durée
 * @params {INT} prix_min_group - le prix minimum pour qu'une course puisse être groupé
 * @params {INT} prix_max_group - le prix maximum pour qu'une course puisse être groupé
 * @return {OBJECT} array_orders_with_groups - un tableau de course avec la date de début, de fin, le prix et la liste des courses qu'elle ontient
 * TODO : pouvoir grouper plus que deux courses
 */
const getOrdersWithGroup = array_order_filtrate_hours => ( prix_min_group , prix_max_group ) => {
	array_orders_with_groups = [];
	for(var i in array_order_filtrate_hours){
		
		// Une course ne peut être groupé que si 
		if(
			array_order_filtrate_hours[i]["start"]["properties"]["price"] >= prix_min_group
			&& array_order_filtrate_hours[i]["start"]["properties"]["price"] < prix_max_group
			&& (typeof( array_order_filtrate_hours[i]["already_groupe"] ) === "undefined" || !array_order_filtrate_hours[i]["already_groupe"])
		){

			// Recherche une course pouvant être groupé avec la course groupable
			var tab_res_course_groupe = getIdCoursePourGroupage( array_order_filtrate_hours )( i );

			// Si une course pour groupage a été trouvé : on groupe les deux courses en une seule
			if( tab_res_course_groupe[0] >= 0 && tab_res_course_groupe[0] != i ){
				
				// Si la course trouvé commence après la course à grouper
				if( tab_res_course_groupe[1] == 1 ){
					array_orders_with_groups.push({
						"date" : {
							"start": array_order_filtrate_hours[i]["start"]["properties"]["date"],
							"end": array_order_filtrate_hours[tab_res_course_groupe[0]]["end"]["properties"]["date"]
						},
						"coordinates" : {
							"start": array_order_filtrate_hours[i]["start"]["geometry"]["coordinates"],
							"end": array_order_filtrate_hours[tab_res_course_groupe[0]]["end"]["geometry"]["coordinates"]
						},
						"price": (array_order_filtrate_hours[i]["start"]["properties"]["price"] + array_order_filtrate_hours[tab_res_course_groupe[0]]["start"]["properties"]["price"]),
						"courses":[array_order_filtrate_hours[i],array_order_filtrate_hours[tab_res_course_groupe[0]]]
					});
					
				// Si la course trouvé commence avant la course à grouper
				} else if( tab_res_course_groupe[1] == 2 ){
					array_orders_with_groups.push({
						"date" : {
							"start": array_order_filtrate_hours[tab_res_course_groupe[0]]["start"]["properties"]["date"],
							"end": array_order_filtrate_hours[i]["end"]["properties"]["date"]
						},
						"coordinates" : {
							"start": array_order_filtrate_hours[tab_res_course_groupe[0]]["start"]["geometry"]["coordinates"],
							"end": array_order_filtrate_hours[i]["end"]["geometry"]["coordinates"]
						},
						"price": (array_order_filtrate_hours[i]["start"]["properties"]["price"] + array_order_filtrate_hours[tab_res_course_groupe[0]]["start"]["properties"]["price"]),
						"courses":[array_order_filtrate_hours[tab_res_course_groupe[0]],array_order_filtrate_hours[i]]
					});
				} else {
					console.log("*ERR : une crouse a trouvé une autre course pour groupage mais la valeur permettant de savoir si elle est avant ou après n'est pas une valeur attendu : "+tab_res_course_groupe[1]);
					return [];
				}
				array_order_filtrate_hours[i]["already_groupe"] = true;
				array_order_filtrate_hours[tab_res_course_groupe[0]]["already_groupe"] = true;
			}
		}
	}
	
	// On remet les courses qui n'ont pas été groupé dans le tableau de résultat
	for(var i in array_order_filtrate_hours){
		if( typeof( array_order_filtrate_hours[i]["already_groupe"] ) === "undefined" || !array_order_filtrate_hours[i]["already_groupe"] ){
			array_orders_with_groups.push({
				"date" : {
					"start": array_order_filtrate_hours[i]["start"]["properties"]["date"],
					"end": array_order_filtrate_hours[i]["end"]["properties"]["date"]
				},
				"coordinates" : {
					"start": array_order_filtrate_hours[i]["start"]["geometry"]["coordinates"],
					"end": array_order_filtrate_hours[i]["end"]["geometry"]["coordinates"]
				},
				"price": (array_order_filtrate_hours[i]["start"]["properties"]["price"]),
				"courses":[array_order_filtrate_hours[i]]
			});
		}
	}
	
	return array_orders_with_groups;
}

/**
 * Fonction qui cherche une course pouvant être groupé à une autre passé en paramètre.
 * @param {OBJECT} tab_courses - le tableau des courses potentiel qui peuvent être groupé
 * @param {INT} index_actuel - l'index de la course à grouper dans le tableau des courses potentiel
 * @return {OBJECT} tableau contenant deux éléments : l'id de la course à grouper en 1er element et le sense : 1 si la course trouvé commence après, 2 si elle commence avant. Si aucune course n'est trouvé : [ -1 , -1 ] est retourné
 * TODO: prendre la meilleur course à grouper et pas la première trouvé (premier d'améliorer la rentabilité des courses groupé)
 */
const getIdCoursePourGroupage = tab_courses => ( index_actuel ) => {

	// Calcul des timestamp de la courses à grouper
	course_deb_ts = moment( tab_courses[index_actuel]["start"]["properties"]["date"] ).format( "x" );
	course_fin_ts = moment( tab_courses[index_actuel]["end"]["properties"]["date"] ).format( "x" );

	// Recherche de course pour groupage
	for(var i in tab_courses){

		// Calcul des timestamp de la course en cours de traitement
		course_tmp_deb_ts = moment( tab_courses[i]["start"]["properties"]["date"] ).format( "x" );
		course_tmp_fin_ts = moment( tab_courses[i]["end"]["properties"]["date"] ).format( "x" );

		// Une course ne peut pas être goupé avec elle même et doit avoir un prix supérieur à 29€
		if(
			i != index_actuel
			&& tab_courses[i]["start"]["properties"]["price"] > PRICE_MAX_ORDER_FOR_GROUP
			&& (typeof( tab_courses[i]["already_groupe"] ) === "undefined" || !tab_courses[i]["already_groupe"])
		){

			// Vérification que la crouse doit commencer max 30 minutes avant la fin de la précédente et doit être situé dans les 10km

			// Si la course commence après la course à grouper
			if(
				geolib.getDistance(
				{"latitude":tab_courses[i]["start"]["geometry"]["coordinates"][1],"longitude":tab_courses[i]["start"]["geometry"]["coordinates"][0]},
				{"latitude":tab_courses[index_actuel]["end"]["geometry"]["coordinates"][1],"longitude":tab_courses[index_actuel]["end"]["geometry"]["coordinates"][0]}
				) < DISTANCE_MAX_GROUP
				&& ( course_fin_ts < course_tmp_deb_ts && course_tmp_deb_ts - course_fin_ts < TIME_MAX_GROUP )
			){
				return [i , 1];

			// Si la course commence avant la course à grouper
			} else if(
				geolib.getDistance(
				{"latitude":tab_courses[i]["end"]["geometry"]["coordinates"][1],"longitude":tab_courses[i]["end"]["geometry"]["coordinates"][0]},
				{"latitude":tab_courses[index_actuel]["start"]["geometry"]["coordinates"][1],"longitude":tab_courses[index_actuel]["start"]["geometry"]["coordinates"][0]}
				) < DISTANCE_MAX_GROUP
				&& ( course_tmp_fin_ts < course_deb_ts && course_deb_ts - course_tmp_fin_ts < TIME_MAX_GROUP )
			){
				return [i , 2];
			}
		}
	}

	// Si la course ne peut pas être groupé!
	return [-1 , -1];
}

/**
 * Fonction qui cherche les courses pour le trusker des 4 prochaines heures dans une liste de courses déjà filtré sur leurs heures de début et groupé si possible
 * @params {OBJECT} array_orders_with_groups - tableau de courses filtré et groupé
 * @params {FLOAT} lat - la latitude du trusker actuellement
 * @params {FLOAT} lng - la longitude du trusker actuellement
 * @params {DATE} datetime - l'heure actuelle
 * @return {OBJECT} retourne le tableau des courses lié au meilleur circuit pour le trusker
 */
const getOrdersForTrusker = array_orders_with_groups => ( lat, lng, datetime ) => {
	
	// Tableau de résultat final
	var array_orders_for_trusker = [];
	
	// Informations pour trouver la première course
	var lat_tmp = lat;
	var lng_tmp = lng;
	var datetime_tmp = datetime;
	
	// Initialisation des variables
	var val_next_course = null;
	var search_next_order = true;
	
	// Tant qu'on trouve une course à suivre et tant qu'on trouve 
	while( search_next_order ){
		
		// Récupération de la prochaine course
		val_next_course = getNextCourse( array_orders_with_groups )( lat_tmp, lng_tmp, datetime_tmp );
		
		// Si une nouvelle course a été trouvé
		if( val_next_course >= 0 ){
			
			// On stock les informations de la nouvelle course
			array_orders_for_trusker.push( array_orders_with_groups[val_next_course] );
			lat_tmp = array_orders_with_groups[val_next_course]["coordinates"]["end"][1];
			lng_tmp = array_orders_with_groups[val_next_course]["coordinates"]["end"][0];
			datetime_tmp = array_orders_with_groups[val_next_course]["date"]["end"];
			
		} else {
			search_next_order = false;
		}
	}
	return array_orders_for_trusker;
}

/**
 * Fonction qui cherche la meilleur course à prendre depuis une position et une date
 * @params {OBJECT} array_orders_with_groups - tableau de courses filtré et groupé
 * @params {FLOAT} lat - la latitude du trusker au moment où il aura besoin de la prochaine course
 * @params {FLOAT} lng - la longitude du trusker au moment où il aura besoin de la prochaine course
 * @params {DATE} datetime - l'heure à laquelle le trusker chercheras une prochaine course
 * @return {INT} l'ID de la meilleure course où -1 si non trouvé
 */
const getNextCourse = array_orders_with_groups => ( lat, lng, datetime ) => {
	// Permet de trouver l'ID de la course ayant la valeur la plus faible
	var value_order = [ -1 , -1 ];
	
	//transformation de la date actuelle en timestamp :
	datetime_ts = moment(datetime).format("x");
	
	// Parcours des courses pour trouver la meilleur première course
	for(var i in array_orders_with_groups){
		
		var start_date = moment( array_orders_with_groups[ i ]["date"]["start"] ).format( "x" );
		
		// Ca ne sert à rien de traiter les courses qui commencent avant la date de disponibilité du trusker
		if( datetime_ts < start_date ){
		
			// Temps entre les deux courses en secondes
			var time_between_booth = parseInt((start_date-datetime_ts)/1000);
			
			// Distance entre les deux courses en mètres
			var length_between_booth = geolib.getDistance(
				{"latitude":lat,"longitude":lng},
				{"latitude":array_orders_with_groups[ i ]["coordinates"]["start"][1],"longitude":array_orders_with_groups[ i ]["coordinates"]["start"][0]}
			);
			
			// On part du principe que 10km ça a autant de poid qu'un trusker qui attend 30 minutes => 10000m = 30*60 (pour que cette égalité soit vraie, il faut mulitiplié le temps par 5.55)
			var valueCourse = (time_between_booth*FACTOR_BETWEEN_TIME_AND_DISTANCE) + length_between_booth;
			
			// Si la course est meilleure que les précédentes, on la stock
			if( value_order[ 0 ] == -1 || value_order[ 1 ] > valueCourse ){
				value_order[ 0 ] = i;
				value_order[ 1 ] = valueCourse;
			}
		}
	}
	
	// On retourne l'ID de la prochaine course
	return value_order[ 0 ];
}

/**
 * Fonction qui affiche quelques infos pour mieux comprendre le tableau résultat 
 */
const displayOrders = array_group_orders => ( datetime ) => {
	
	// On vérifie la présence de courses dans le tableau 
	if( array_group_orders.length > 0 ){
		
		// Variable de compte ou d'affichage
		var sum = 0;
		var date_start = array_group_orders[ 0 ][ "date" ][ "start" ];
		var date_end = array_group_orders[ (array_group_orders.length - 1) ][ "date" ][ "end" ];
		var nb_course = 0;
		var grouped_orders_isset = false;
		var nom_des_courses = "";
		
		// Calcules des variables
		for(var i in array_group_orders){
			sum += array_group_orders[ i ][ "price" ];
			nb_course += array_group_orders[ i ][ "courses" ].length;
			if( array_group_orders[ i ][ "courses" ].length > 1 ){
				grouped_orders_isset = true;
			}
			for(var j in array_group_orders[ i ][ "courses" ] ){
				if( nom_des_courses != "" ){ nom_des_courses += " puis "; }
				nom_des_courses += array_group_orders[ i ][ "courses" ][ j ]["start"]["properties"]["name"];
			}
		}
		
		// Affichage des résultats
		console.log("\nIl est actuellement le "+datetime);
		console.log("La première course commence le "+date_start);
		console.log("La dernière course se termineras le "+date_end);
		console.log("Il y aura en tout "+nb_course+" courses pour un montant total de "+(sum/100)+"€");
		if( grouped_orders_isset ){
			console.log("Ce circuit contient des courses groupées");
		} else {
			console.log("Ce circuit ne contient pas de courses groupée");
		}
		console.log("Voici la liste des courses : ");
		console.log( nom_des_courses );
		
	} else {
		console.log("Aucune données dans le tableau de course à afficher");
	}
}

const lat = 48.8534100;
const lng = 2.3488000;
const datetime = '2017-07-15T12:00:01Z';

// Récupération du tableau de résultat 
var array_group_orders = groupOrders(orders)(lat, lng, datetime);
// Affichage du tableau de résultat
console.log( array_group_orders );
// Affichage d'information claire pour le trusker
displayOrders( array_group_orders )(datetime);

