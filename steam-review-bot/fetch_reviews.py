import requests
import json

def fetch_reviews(game_ids, output_file="app/reviews.json"):
    """
    Fetches reviews for a list of game IDs from the Steam Reviews API and saves them to a JSON file.

    Parameters:
        game_ids (list): List of Steam game IDs.
        output_file (str): Path to save the resulting JSON file.
    """
    base_url = "https://store.steampowered.com/appreviews/"
    reviews_data = {}

    for game_id in game_ids:
        print(f"Fetching reviews for game ID: {game_id}...")
        params = {
            "json": "1",  # Ensures the response is in JSON format
            "num_per_page": 40  # Default limit, fetches up to 20 reviews
        }
        
        response = requests.get(base_url + str(game_id), params=params)
        if response.status_code == 200:
            data = response.json()
            if data.get("success") == 1:
                reviews = data.get("reviews", [])
                reviews_data[game_id] = [
                    {
                        "review": review.get("review"),
                        "weighted_vote_score": review.get("weighted_vote_score")
                    }
                    for review in reviews
                ]
            else:
                print(f"Failed to fetch reviews for game ID: {game_id}. API success flag was 0.")
        else:
            print(f"Error: Received status code {response.status_code} for game ID: {game_id}")

    # Save the reviews data to the specified JSON file
    with open(output_file, "w", encoding="utf-8") as json_file:
        json.dump(reviews_data, json_file, ensure_ascii=False, indent=4)

    print(f"Reviews successfully saved to {output_file}.")

# Example usage
if __name__ == "__main__":
    # Replace with your list of Steam game IDs
    #               CS:GO, Dota 2, TF2, Noita, Fifa 25,  Madden 25, COD:BO6, Portal 2
    game_ids_to_fetch = [730, 570, 440, 881100, 2669320, 2582560, 2933620, 620]  # Example IDs: CS:GO, Dota 2, Team Fortress 2
    fetch_reviews(game_ids_to_fetch)
