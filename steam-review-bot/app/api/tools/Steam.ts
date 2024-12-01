// File of wrapper functions for Steam's Reviews API
import axios from "axios";

const BASE_URL = "https://store.steampowered.com/appreviews";
const APP_LIST_URL = "https://api.steampowered.com/ISteamApps/GetAppList/v0002/";

// Interfaces for App List to get ID
interface App {
  appid: number;
  name: string;
}

interface AppListResponse {
  applist: {
    apps: App[];
  };
}

// Interface for reduced review information
interface PartialReviewAuthor {
  steamid: string;
  num_games_owned: number;
  num_reviews: number;
  playtime_forever: number;
  playtime_forever_hours: number; // Converted to hours
}

interface PartialSteamReview {
  recommendationid: string;
  author: PartialReviewAuthor;
  language: string;
  review: string;
  voted_up: boolean;
  votes_up: number;
  votes_funny: number;
  weighted_vote_score: number;
  comment_count: number;
  developer_response?: string;
}

interface ReviewQuerySummary {
  num_reviews: number;
  review_score: number;
  review_score_desc: string;
  total_positive: number;
  total_negative: number;
  total_reviews: number;
  cursor: string;
}

interface SteamReviewsResponse {
  success: number;
  query_summary: ReviewQuerySummary;
  reviews: PartialSteamReview[]; // Full response from API
}

export class SteamReviewsAPI {
  static appList: App[] | null = null;

  /**
   * Fetch reviews for a specific Steam app.
   * @param game_name - The name of the game to search for.
   * @param cursor - The cursor for paginated results. Default is "*".
   * @param limit - Maximum number of reviews to fetch. Default is 20.
   * @returns An array of reviews and query summary data.
   */
  static async fetchReviews(
    game_name: string,
    cursor: string = "*",
    limit: number = 20
  ): Promise<{ querySummary: ReviewQuerySummary; reviews: PartialSteamReview[] }> {
    console.log("Using Review Fetch Tool");

    // Fetch list of games and app IDs if not already cached
    if (!this.appList) {
      console.log("Fetching app list from Steam API...");
      const response = await axios.get<AppListResponse>(APP_LIST_URL);
      this.appList = response.data.applist.apps;
    }

    // Normalize the search term for case-insensitive comparison
    const normalizedName = game_name.toLowerCase();
    // Find exact match for the game name
    const exactMatch = this.appList?.find((app) => app.name.toLowerCase() === normalizedName);

    if (!exactMatch) {
      throw new Error(`Game "${game_name}" not found.`);
    }

    const appid = exactMatch.appid;
    console.log(`Fetching reviews for app ID: ${appid}`);

    try {
      const response = await axios.get<SteamReviewsResponse>(
        `${BASE_URL}/${appid}?json=1`,
        { params: { cursor, num_per_page: limit } }
      );

      if (response.data.success !== 1) {
        throw new Error("Failed to fetch reviews from Steam API.");
      }

      const { query_summary, reviews } = response.data;

      // Map and return reduced reviews
      return {
        querySummary: query_summary,
        reviews: reviews.map((review) => ({
          recommendationid: review.recommendationid,
          author: {
            steamid: review.author.steamid,
            num_games_owned: review.author.num_games_owned,
            num_reviews: review.author.num_reviews,
            playtime_forever: review.author.playtime_forever,
            playtime_forever_hours: Math.round(review.author.playtime_forever / 60),
          },
          language: review.language,
          review: review.review,
          voted_up: review.voted_up,
          votes_up: review.votes_up,
          votes_funny: review.votes_funny,
          weighted_vote_score: review.weighted_vote_score,
          comment_count: review.comment_count,
          developer_response: review.developer_response,
        })),
      };
    } catch (error) {
      console.error("Error fetching Steam reviews:", error);
      throw new Error("Failed to fetch reviews from Steam API.");
    }
  }
}
