import { CreateCommentDto } from './create-comment.dto';

// BLG-07: editing a comment follows the same rules as creating one
export class UpdateCommentDto extends CreateCommentDto {}