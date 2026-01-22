#!/bin/bash
set -e

# Fonction pour appliquer une variable d'environnement
# Remplace la valeur précédant //<-{VARIABLE_NAME} par la valeur de la variable d'environnement
applyEnvVar() {
    local var_name=$1
    local var_value=$2
    local file_path=$3
    
    if [ ! -f "$file_path" ]; then
        return 0
    fi
    
    # Déterminer le format de la valeur (avec ou sans guillemets)
    # Si la valeur est numérique, pas de guillemets. Sinon, avec guillemets simples.
    local formatted_value
    if [[ "$var_value" =~ ^[0-9]+$ ]]; then
        # Valeur numérique : pas de guillemets
        formatted_value="$var_value"
    else
        # Valeur non-numérique : avec guillemets simples (échapper les guillemets dans la valeur)
        local escaped_value=$(printf '%s\n' "$var_value" | sed "s/'/\\\\'/g")
        formatted_value="'$escaped_value'"
    fi
    
    # Échapper les caractères spéciaux pour sed
    local escaped_formatted=$(printf '%s\n' "$formatted_value" | sed 's/[[\.*^$()+?{|]/\\&/g')
    
    # Expression régulière exhaustive pour gérer tous les cas d'espacement
    # Pattern: =[espaces]*[valeur][espaces]*;[espaces]*//[espaces]*<-{VARIABLE}
    #  * = zéro ou plusieurs caractères d'espacement (espace, tab, etc.)
    # [^;]* = capture tout sauf le point-virgule (la valeur à remplacer, peut contenir des espaces)
    # La regex remplace : =[espaces][valeur][espaces];[espaces]//[espaces]<-{VAR}
    # Par : = [nouvelle_valeur];//<-{VAR}
    sed -i.bak "s|= *[^;]* *; *\/\/ *<-{$var_name}|= $escaped_formatted;//<-{$var_name}|g" "$file_path"
    rm -f "$file_path.bak"
    
    echo "$var_name mis à jour: $var_value"
}

# Attendre un peu pour s'assurer que le volume est bien monté
sleep 0.5

# SOLUTION RECOMMANDÉE : Utiliser un répertoire de configuration séparé
# Cela évite les conflits avec le volume monté qui peut contenir config.js
# Utiliser un répertoire dans /tmp pour éviter le partage via volume monté
CONFIG_DIR="/tmp/lansuperv-config"
CONFIG_FILE="${CONFIG_DIR}/config.js"

# Créer le répertoire de configuration (hors du volume monté)
mkdir -p "$CONFIG_DIR"

# Copier config.js.sample vers le répertoire de configuration
if [ -f "/app/config.js.sample" ]; then
    echo "Copie de /app/config.js.sample vers $CONFIG_FILE"
    cp -f "/app/config.js.sample" "$CONFIG_FILE"
    
    # Appliquer les variables d'environnement
    if [ -f "$CONFIG_FILE" ]; then
        # Appliquer SERVER_PORT si défini
        if [ -n "$SERVER_PORT" ]; then
            applyEnvVar "SERVER_PORT" "$SERVER_PORT" "$CONFIG_FILE"
        fi
        
        # Appliquer SOCKET_PORT si défini
        if [ -n "$SOCKET_PORT" ]; then
            applyEnvVar "SOCKET_PORT" "$SOCKET_PORT" "$CONFIG_FILE"
        fi
        
        # Appliquer SERVER_ADDRESS si défini (peut être une chaîne vide)
        if [ -n "${SERVER_ADDRESS+x}" ]; then
            applyEnvVar "SERVER_ADDRESS" "$SERVER_ADDRESS" "$CONFIG_FILE"
        fi
    fi
    
    # Exporter le chemin pour l'application
    export CONFIG_FILE
else
    echo "ATTENTION: /app/config.js.sample non trouvé"
fi

# Exécuter la commande passée en argument (ou la commande par défaut)
exec "$@"
